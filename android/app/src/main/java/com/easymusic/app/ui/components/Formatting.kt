package com.easymusic.app.ui.components

import com.easymusic.app.library.data.TrackResponse
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

fun Int.formatDuration(): String {
    val hours = this / 3600
    val minutes = (this % 3600) / 60
    val seconds = this % 60
    return if (hours > 0) {
        "$hours:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}"
    } else {
        "$minutes:${seconds.toString().padStart(2, '0')}"
    }
}

fun Long.formatPlaybackTime(): String = (this / 1_000L).coerceAtLeast(0L).toInt().formatDuration()

fun Long.formatBytes(): String =
    when {
        this >= 1_073_741_824L -> String.format(Locale.US, "%.2f GB", this / 1_073_741_824.0)
        this >= 1_048_576L -> String.format(Locale.US, "%.1f MB", this / 1_048_576.0)
        this >= 1_024L -> String.format(Locale.US, "%.0f KB", this / 1_024.0)
        else -> "$this B"
    }

/** Artist line under a track title. Album is not shown: the owner identifies tracks by artist. */
fun trackSubtitle(artist: String?, fallback: String = "未填写艺人"): String =
    artist?.trim().orEmpty().ifBlank { fallback }

fun TrackResponse.subtitle(): String = trackSubtitle(artist)

fun formatTrackStatus(status: String): String =
    when (status.lowercase()) {
        "ready" -> "可播放"
        "uploaded" -> "已上传"
        "uploading" -> "上传中"
        "processing" -> "处理中"
        "failed" -> "处理失败"
        else -> status
    }

fun formatContentType(contentType: String): String =
    when (contentType) {
        "song" -> "歌曲"
        "mix" -> "混音/合集"
        "long_audio" -> "长音频"
        "white_noise" -> "白噪音"
        "ost" -> "OST"
        "other" -> "其他"
        else -> contentType.replace('_', ' ')
    }

fun String.isProcessingStatus(): Boolean =
    equals("processing", ignoreCase = true) || equals("uploaded", ignoreCase = true)

private val dateTimeFormatter = DateTimeFormatter.ofPattern("yyyy年M月d日 HH:mm", Locale.CHINA)

/** Formats an ISO-8601 timestamp in the device time zone; unknown input is returned as-is. */
fun formatDateTime(value: String?): String {
    if (value.isNullOrBlank()) return "—"
    return try {
        OffsetDateTime.parse(value)
            .atZoneSameInstant(ZoneId.systemDefault())
            .format(dateTimeFormatter)
    } catch (_: Exception) {
        value
    }
}
