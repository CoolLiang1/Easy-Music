package com.easymusic.app.recommendation.ui

import com.easymusic.app.recommendation.data.RecommendationExplanation
import com.easymusic.app.recommendation.data.RecommendationExplanationPart
import java.util.Locale

internal fun formatRecommendationExplanationForDisplay(
    explanation: RecommendationExplanation,
): String {
    val parts = linkedSetOf<String>()

    listOf("scenario", "state", "type", "attribute").forEach { group ->
        val tags = explanation.matchedTags[group].orEmpty()
        if (tags.isNotEmpty()) {
            parts += "${tagGroupLabels[group] ?: group}：${tags.joinToString(", ") { it.name }}"
        }
    }

    parts += explanation.boosts.map(::formatExplanationPartForDisplay)
    parts += explanation.penalties.map(::formatExplanationPartForDisplay)
    parts += explanation.feedbackImpacts.map(::formatExplanationPartForDisplay)
    parts += explanation.avoidanceReasons.map(::formatExplanationPartForDisplay)

    return parts.filter { it.isNotBlank() }.joinToString("；")
}

internal fun formatRecommendationReasonForDisplay(reason: String): String {
    val segments = reason
        .split(";")
        .map { it.trim() }
        .filter { it.isNotEmpty() }

    if (segments.isEmpty()) {
        return reason
    }

    return segments.joinToString("；") { formatReasonSegment(it) }
}

private fun formatReasonSegment(segment: String): String {
    val label = segment.stripTrailingPeriod()
    val tagMatch = tagMatchRegex.matchEntire(label)
    if (tagMatch != null) {
        val group = tagMatch.groupValues[1]
        val tags = tagMatch.groupValues[2]
        return "${tagGroupLabels[group] ?: group}：$tags"
    }

    return formatExplanationLabel(label)
}

private fun formatExplanationPartForDisplay(part: RecommendationExplanationPart): String {
    val label = formatExplanationLabel(part.label)
    val scoreDelta = part.scoreDelta ?: return label
    val prefix = if (scoreDelta > 0) "+" else ""
    return "$label（$prefix${formatScoreDelta(scoreDelta)}）"
}

private fun formatExplanationLabel(label: String): String {
    val normalized = label.trim().stripTrailingPeriod()

    playlistMembershipRegex.matchEntire(normalized)?.let { match ->
        return "已加入你的歌单：${match.groupValues[1]}"
    }

    playlistContextRegex.matchEntire(normalized)?.let { match ->
        return "歌单名称/描述匹配：${match.groupValues[1]}"
    }

    excludedAttributeRegex.matchEntire(normalized)?.let { match ->
        return "命中排除属性：${match.groupValues[1]}"
    }

    matchedExcludedAttributeRegex.matchEntire(normalized)?.let { match ->
        return "规避属性命中：${match.groupValues[1]}"
    }

    return explanationLabels[normalized] ?: normalized.replace(Regex("[_-]+"), " ")
}

private fun String.stripTrailingPeriod(): String =
    if (endsWith(".")) dropLast(1) else this

private fun formatScoreDelta(delta: Double): String =
    String.format(Locale.US, "%.2f", delta).replace(Regex("""\.?0+$"""), "")

private val tagGroupLabels = mapOf(
    "scenario" to "场景匹配",
    "state" to "状态匹配",
    "type" to "类型匹配",
    "attribute" to "属性匹配",
)

private val explanationLabels = mapOf(
    "liked track boost" to "你喜欢的歌曲",
    "Liked track boost applied" to "你喜欢的歌曲",
    "active cooldown soft penalty" to "最近听过，已轻微降权",
    "active cooldown retained by soft mode" to "软冷却模式保留了这首歌，只降低排序",
    "recently played penalty" to "最近播放过，已降低排序",
    "dislike feedback penalty" to "你标记过不喜欢，已明显降权",
    "not suitable for this context penalty" to "曾反馈不适合类似场景，已降权",
    "recent recommendation skip penalty" to "近期跳过过推荐，已降权",
    "no requested tag matches" to "没有命中当前选择的标签",
)

private val tagMatchRegex = Regex("""^matched (scenario|state|type|attribute) tags?: (.+)$""")
private val playlistMembershipRegex = Regex("""^playlist membership boost: (.+)$""")
private val playlistContextRegex = Regex("""^playlist context boost: (.+)$""")
private val excludedAttributeRegex = Regex("""^excluded attribute penalty: (.+)$""")
private val matchedExcludedAttributeRegex = Regex("""^matched excluded attributes: (.+)$""")
