package com.easymusic.app.recommendation.ui

import com.easymusic.app.recommendation.data.RecommendationExplanation
import com.easymusic.app.recommendation.data.RecommendationExplanationPart
import com.easymusic.app.recommendation.data.RecommendationExplanationTag
import org.junit.Assert.assertEquals
import org.junit.Test

class RecommendationReasonFormatterTest {
    @Test
    fun formatsStructuredExplanationForDisplay() {
        val explanation = RecommendationExplanation(
            matchedTags = mapOf(
                "scenario" to listOf(
                    RecommendationExplanationTag(id = 1, name = "focus", group = "scenario"),
                ),
            ),
            boosts = listOf(
                RecommendationExplanationPart(
                    label = "playlist context boost: Focus Flow",
                    scoreDelta = 1.5,
                ),
            ),
            penalties = listOf(
                RecommendationExplanationPart(
                    label = "active cooldown soft penalty",
                    scoreDelta = -1.0,
                ),
            ),
            feedbackImpacts = listOf(
                RecommendationExplanationPart(
                    label = "dislike feedback penalty",
                    scoreDelta = -8.0,
                ),
            ),
            avoidanceReasons = emptyList(),
        )

        assertEquals(
            "场景匹配：focus；歌单名称/描述匹配：Focus Flow（+1.5）；最近听过，已轻微降权（-1）；你标记过不喜欢，已明显降权（-8）",
            formatRecommendationExplanationForDisplay(explanation),
        )
    }

    @Test
    fun formatsPlaylistBoostsForDisplay() {
        val formatted = formatRecommendationReasonForDisplay(
            "matched scenario tags: focus; playlist membership boost: Work Mix; playlist context boost: Focus Flow.",
        )

        assertEquals(
            "场景匹配：focus；已加入你的歌单：Work Mix；歌单名称/描述匹配：Focus Flow",
            formatted,
        )
    }

    @Test
    fun formatsCooldownAndDislikePenaltiesForDisplay() {
        val formatted = formatRecommendationReasonForDisplay(
            "active cooldown soft penalty; dislike feedback penalty.",
        )

        assertEquals("最近听过，已轻微降权；你标记过不喜欢，已明显降权", formatted)
    }

    @Test
    fun formatsKnownFallbackRecommendationReasonsForDisplay() {
        val formatted = formatRecommendationReasonForDisplay(
            "liked track boost; recently played penalty; no requested tag matches.",
        )

        assertEquals("你喜欢的歌曲；最近播放过，已降低排序；没有命中当前选择的标签", formatted)
    }
}
