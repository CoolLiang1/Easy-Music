package com.easymusic.app.cache.data

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext
import java.io.File
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import kotlin.coroutines.coroutineContext

sealed interface CacheFileDownloadResult {
    data class Success(
        val file: File,
        val byteSize: Long,
        val contentType: String?,
    ) : CacheFileDownloadResult

    data class Failure(val message: String) : CacheFileDownloadResult
}

data class CacheDownloadProgress(
    val bytesDownloaded: Long,
    val totalBytes: Long?,
)

class CacheFileStore(
    private val cacheDirectory: File,
) {
    constructor(context: Context) : this(
        File(context.applicationContext.filesDir, CACHE_DIRECTORY_NAME),
    )

    fun finalFileForTrack(trackId: Int): File =
        File(cacheDirectory, "track-$trackId.mp3")

    suspend fun downloadTrackStream(
        trackId: Int,
        streamUrl: String,
        bearerToken: String,
        onProgress: (CacheDownloadProgress) -> Unit = {},
    ): CacheFileDownloadResult = withContext(Dispatchers.IO) {
        cacheDirectory.mkdirs()

        val finalFile = finalFileForTrack(trackId)
        val temporaryFile = File(cacheDirectory, "${finalFile.name}.part")
        var connection: HttpURLConnection? = null

        try {
            connection = (URL(streamUrl).openConnection() as HttpURLConnection).apply {
                requestMethod = "GET"
                connectTimeout = CONNECT_TIMEOUT_MS
                readTimeout = READ_TIMEOUT_MS
                setRequestProperty("Authorization", "Bearer $bearerToken")
                setRequestProperty("Accept", "audio/mpeg")
            }

            val statusCode = connection.responseCode
            if (statusCode == HttpURLConnection.HTTP_UNAUTHORIZED) {
                deleteOneFile(temporaryFile)
                return@withContext CacheFileDownloadResult.Failure("Please sign in again to cache this track.")
            }
            if (statusCode !in 200..299) {
                deleteOneFile(temporaryFile)
                return@withContext CacheFileDownloadResult.Failure("Stream download failed with HTTP $statusCode.")
            }

            val totalBytes = connection.contentLengthLong.takeIf { it > 0L }
            var bytesDownloaded = 0L
            val buffer = ByteArray(DEFAULT_BUFFER_SIZE)

            connection.inputStream.use { input ->
                temporaryFile.outputStream().use { output ->
                    while (true) {
                        coroutineContext.ensureActive()
                        val read = input.read(buffer)
                        if (read == -1) {
                            break
                        }
                        output.write(buffer, 0, read)
                        bytesDownloaded += read
                        onProgress(
                            CacheDownloadProgress(
                                bytesDownloaded = bytesDownloaded,
                                totalBytes = totalBytes,
                            ),
                        )
                    }
                }
            }

            deleteOneFile(finalFile)
            if (!temporaryFile.renameTo(finalFile)) {
                deleteOneFile(temporaryFile)
                return@withContext CacheFileDownloadResult.Failure("Downloaded file could not be finalized.")
            }

            CacheFileDownloadResult.Success(
                file = finalFile,
                byteSize = bytesDownloaded,
                contentType = connection.contentType,
            )
        } catch (exception: CancellationException) {
            deleteOneFile(temporaryFile)
            throw exception
        } catch (exception: IOException) {
            deleteOneFile(temporaryFile)
            CacheFileDownloadResult.Failure(exception.message ?: "Track download failed.")
        } finally {
            connection?.disconnect()
        }
    }

    private fun deleteOneFile(file: File) {
        if (file.exists() && file.isFile) {
            file.delete()
        }
    }

    private companion object {
        const val CACHE_DIRECTORY_NAME = "track_cache"
        const val CONNECT_TIMEOUT_MS = 15_000
        const val READ_TIMEOUT_MS = 60_000
    }
}
