package com.easymusic.app.ui.components

import android.content.Context
import android.graphics.BitmapFactory
import android.util.LruCache
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.easymusic.app.auth.data.AuthTokenStore
import com.easymusic.app.core.config.AppConfig
import com.easymusic.app.core.network.AccessTokenRenewal
import java.net.HttpURLConnection
import java.net.URL
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withContext

/**
 * Square artwork for a track: the authenticated cover when the backend has one,
 * otherwise a stable gradient tile with the title's first character.
 */
@Composable
fun TrackArtwork(
    trackId: Int,
    title: String,
    modifier: Modifier = Modifier,
    coverPath: String? = null,
    coverVersion: String? = null,
    size: Dp = 48.dp,
    artist: String? = null,
) {
    val context = LocalContext.current
    val cacheKey = coverPath?.let { "$trackId:$it:${coverVersion.orEmpty()}" }
    var image by remember(cacheKey) { mutableStateOf(cacheKey?.let(CoverImageLoader::cached)) }

    LaunchedEffect(cacheKey) {
        if (cacheKey != null && image == null) {
            image = CoverImageLoader.load(context, trackId, cacheKey)
        }
    }

    val shape = RoundedCornerShape(size * 0.16f)
    Box(
        modifier = modifier
            .size(size)
            .clip(shape)
            .drawBehind { drawPlaceholderArtwork(artist?.trim()?.ifBlank { null } ?: title.ifBlank { trackId.toString() }) },
        contentAlignment = Alignment.Center,
    ) {
        val loaded = image
        if (loaded != null) {
            Image(
                bitmap = loaded,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
            )
        } else {
            Text(
                text = firstGlyph(title),
                color = Color.White.copy(alpha = 0.9f),
                fontWeight = FontWeight.Bold,
                fontSize = (size.value * 0.4f).sp,
            )
        }
    }
}

/** First letter or digit of the title, skipping brackets and symbols such as 【. */
internal fun firstGlyph(title: String): String {
    val trimmed = title.trim()
    var index = 0
    while (index < trimmed.length) {
        val codePoint = trimmed.codePointAt(index)
        if (Character.isLetterOrDigit(codePoint)) {
            return String(Character.toChars(codePoint)).uppercase()
        }
        index += Character.charCount(codePoint)
    }
    return "♪"
}

private val placeholderPalette = listOf(
    Color(0xFFDD733F) to Color(0xFF9A512F),
    Color(0xFF2E6E78) to Color(0xFF1D474E),
    Color(0xFF8A4C70) to Color(0xFF552D45),
    Color(0xFF506B28) to Color(0xFF33461A),
    Color(0xFFB5862F) to Color(0xFF6E4F17),
    Color(0xFF9A512F) to Color(0xFF5A2E1A),
    Color(0xFF6E5B4C) to Color(0xFF3B2619),
    Color(0xFF3F5F8A) to Color(0xFF263A57),
    Color(0xFFA3434A) to Color(0xFF65262B),
)

/**
 * Generated artwork for tracks without a cover: colour from the artist (or the
 * title), plus a seeded record-groove pattern. Keep in step with Web
 * `TrackCover.tsx` `placeholderArtwork`.
 */
private fun DrawScope.drawPlaceholderArtwork(seed: String) {
    val hash = placeholderHash(seed)
    val (from, to) = placeholderPalette[Math.floorMod(hash, placeholderPalette.size)]
    drawRect(Brush.linearGradient(listOf(from, to), start = Offset.Zero, end = Offset(size.width, size.height)))

    val center = Offset(
        size.width * (25 + Math.floorMod(hash ushr 3, 50)) / 100f,
        size.height * (25 + Math.floorMod(hash ushr 9, 50)) / 100f,
    )
    val edge = size.minDimension
    val groove = Color.White.copy(alpha = 0.09f)
    val step = edge * 0.045f
    var radius = step
    val reach = edge * 1.5f
    while (radius < reach) {
        drawCircle(color = groove, radius = radius, center = center, style = Stroke(width = edge * 0.012f))
        radius += step
    }
    drawCircle(color = Color.White.copy(alpha = 0.2f), radius = edge * 0.07f, center = center)
}

internal fun placeholderHash(seed: String): Int {
    var hash = 0
    seed.forEach { char -> hash = hash * 31 + char.code }
    return hash
}

/** Small in-memory cover cache; covers are fetched with the stored bearer token. */
object CoverImageLoader {
    private val memory = object : LruCache<String, ImageBitmap>(8 * 1024 * 1024) {
        override fun sizeOf(key: String, value: ImageBitmap): Int = value.width * value.height * 4
    }
    private val failed = mutableSetOf<String>()
    private val concurrency = Semaphore(4)

    fun cached(key: String): ImageBitmap? = memory.get(key)

    suspend fun load(context: Context, trackId: Int, key: String): ImageBitmap? {
        memory.get(key)?.let { return it }
        if (synchronized(failed) { key in failed }) return null

        return concurrency.withPermit {
            withContext(Dispatchers.IO) {
                val token = AuthTokenStore(context.applicationContext).readToken() ?: return@withContext null
                val first = fetch(trackId, token)
                val bitmap = if (first.statusCode == HttpURLConnection.HTTP_UNAUTHORIZED) {
                    AccessTokenRenewal.renewer?.renewAfterUnauthorized(token)?.let { fetch(trackId, it).image }
                } else {
                    first.image
                }
                if (bitmap == null) {
                    // Remember only definite misses; network errors may succeed later.
                    if (first.statusCode == HttpURLConnection.HTTP_NOT_FOUND) {
                        synchronized(failed) { failed += key }
                    }
                    null
                } else {
                    memory.put(key, bitmap)
                    bitmap
                }
            }
        }
    }

    private class CoverFetch(val statusCode: Int, val image: ImageBitmap?)

    private fun fetch(trackId: Int, token: String): CoverFetch {
        val baseUrl = AppConfig.default().apiBaseUrl.trimEnd('/')
        val connection = (URL("$baseUrl/api/tracks/$trackId/cover").openConnection() as HttpURLConnection)
        return try {
            connection.connectTimeout = 8_000
            connection.readTimeout = 15_000
            connection.setRequestProperty("Authorization", "Bearer $token")
            val code = connection.responseCode
            if (code != HttpURLConnection.HTTP_OK) return CoverFetch(code, null)
            val bytes = connection.inputStream.use { it.readBytes() }
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
            var sample = 1
            while (bounds.outWidth / (sample * 2) >= 512 && bounds.outHeight / (sample * 2) >= 512) {
                sample *= 2
            }
            val image = BitmapFactory
                .decodeByteArray(bytes, 0, bytes.size, BitmapFactory.Options().apply { inSampleSize = sample })
                ?.asImageBitmap()
            CoverFetch(code, image)
        } catch (_: Exception) {
            CoverFetch(-1, null)
        } finally {
            connection.disconnect()
        }
    }
}
