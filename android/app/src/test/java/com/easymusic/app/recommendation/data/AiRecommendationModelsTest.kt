package com.easymusic.app.recommendation.data

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class AiRecommendationModelsTest {

    // -----------------------------------------------------------------------
    // request JSON construction
    // -----------------------------------------------------------------------

    @Test
    fun parseIntentRequestSerializesCorrectJson() {
        val request = AiParseIntentRequest(
            text = "calm focus music",
            client = "android",
            fallbackToEmpty = true,
        )

        val json = JSONObject(request.toJson())

        assertEquals("calm focus music", json.getString("text"))
        assertEquals("android", json.getString("client"))
        assertTrue(json.getBoolean("fallback_to_empty"))
    }

    @Test
    fun aiRecommendRequestSerializesCorrectJson() {
        val request = AiRecommendRequest(
            text = "energetic workout",
            limit = 2,
            client = "android",
            fallbackToEmpty = false,
        )

        val json = JSONObject(request.toJson())

        assertEquals("energetic workout", json.getString("text"))
        assertEquals(2, json.getInt("limit"))
        assertEquals("android", json.getString("client"))
        assertFalse(json.getBoolean("fallback_to_empty"))
    }

    // -----------------------------------------------------------------------
    // ParsedIntentResponse parsing
    // -----------------------------------------------------------------------

    @Test
    fun parsesParsedIntentResponseWithMatchedTagsAndExplanation() {
        val json = JSONObject(
            """
            {
              "structured_request": {
                "scene_tag_ids": [1],
                "feature_tag_ids": [2],
                "type_tag_ids": [],
                "raw_text": "calm focus music",
                "cooldown_mode": "strict",
                "limit": 3,
                "client": "android"
              },
              "matched_tags": {
                "scene": [
                  {"id": 1, "name": "Focus", "group": "scene"}
                ],
                "feature": [
                  {"id": 2, "name": "Calm", "group": "feature"}
                ]
              },
              "unmatched_terms": ["loud"],
              "explanation": "Mapped 'calm focus' to Focus+Calm.",
              "provider_status": "ok"
            }
            """.trimIndent(),
        )

        val parsed = ParsedIntentResponse.fromJson(json)

        assertEquals("ok", parsed.providerStatus)
        assertTrue(parsed.isOk)
        assertEquals("Mapped 'calm focus' to Focus+Calm.", parsed.explanation)

        // structured request
        assertEquals(listOf(1), parsed.structuredRequest.sceneTagIds)
        assertEquals(listOf(2), parsed.structuredRequest.featureTagIds)
        assertEquals(emptyList<Int>(), parsed.structuredRequest.typeTagIds)
        assertEquals("calm focus music", parsed.structuredRequest.rawText)
        assertEquals(RecommendationCooldownMode.Strict, parsed.structuredRequest.cooldownMode)
        assertEquals(3, parsed.structuredRequest.limit)
        assertEquals("android", parsed.structuredRequest.client)

        // matched tags
        assertEquals(2, parsed.matchedTags.size)
        assertEquals("Focus", parsed.matchedTags["scene"]!!.single().name)
        assertEquals("Calm", parsed.matchedTags["feature"]!!.single().name)

        // unmatched terms
        assertEquals(listOf("loud"), parsed.unmatchedTerms)
    }

    @Test
    fun parsesParsedIntentWithDisabledProviderStatus() {
        val json = JSONObject(
            """
            {
              "structured_request": {
                "scene_tag_ids": [],
                "feature_tag_ids": [],
                "type_tag_ids": [],
                "limit": 3,
                "client": null
              },
              "matched_tags": {},
              "unmatched_terms": [],
              "explanation": null,
              "provider_status": "disabled"
            }
            """.trimIndent(),
        )

        val parsed = ParsedIntentResponse.fromJson(json)

        assertEquals("disabled", parsed.providerStatus)
        assertFalse(parsed.isOk)
        assertTrue(parsed.matchedTags.isEmpty())
        assertTrue(parsed.unmatchedTerms.isEmpty())
        assertTrue(parsed.structuredRequest.sceneTagIds.isEmpty())
    }

    @Test
    fun parsesParsedIntentWithUnconfiguredProviderStatus() {
        val json = JSONObject(
            """
            {
              "structured_request": {
                "scene_tag_ids": [],
                "feature_tag_ids": [],
                "type_tag_ids": [],
                "limit": 3,
                "client": null
              },
              "matched_tags": {},
              "unmatched_terms": [],
              "explanation": null,
              "provider_status": "unconfigured"
            }
            """.trimIndent(),
        )

        val parsed = ParsedIntentResponse.fromJson(json)

        assertEquals("unconfigured", parsed.providerStatus)
        assertFalse(parsed.isOk)
    }

    // -----------------------------------------------------------------------
    // AiRecommendResponse parsing
    // -----------------------------------------------------------------------

    @Test
    fun parsesAiRecommendResponseWithThreeResults() {
        val json = JSONObject(threeResultAiRecommendJson())

        val response = AiRecommendResponse.fromJson(json)

        assertEquals("ai-req-001", response.requestId)
        assertEquals(3, response.results.size)
        assertEquals(listOf(1, 2, 3), response.results.map { it.rank })

        // parsed intent
        assertEquals("ok", response.parsedIntent.providerStatus)
        assertEquals("Focus", response.parsedIntent.matchedTags["scene"]!!.single().name)

        // results
        assertEquals("Morning Focus", response.results[0].track.title)
        assertEquals("Matched scene and feature tags.", response.results[0].reason)
        assertTrue(response.results.all { it.track.isReady })
    }

    @Test
    fun parsesAiRecommendResponseWithEmptyResults() {
        val json = JSONObject(
            """
            {
              "parsed_intent": {
                "structured_request": {
                  "scene_tag_ids": [1],
                  "feature_tag_ids": [],
                  "type_tag_ids": [],
                  "limit": 3,
                  "client": "android"
                },
                "matched_tags": {
                  "scene": [{"id": 1, "name": "Focus", "group": "scene"}]
                },
                "unmatched_terms": [],
                "explanation": null,
                "provider_status": "ok"
              },
              "request_id": "ai-empty-001",
              "results": []
            }
            """.trimIndent(),
        )

        val response = AiRecommendResponse.fromJson(json)

        assertEquals("ai-empty-001", response.requestId)
        assertTrue(response.results.isEmpty())
        assertEquals("ok", response.parsedIntent.providerStatus)
    }

    @Test
    fun parsesAiRecommendResponseWithProviderUnavailable() {
        val json = JSONObject(
            """
            {
              "parsed_intent": {
                "structured_request": {
                  "scene_tag_ids": [],
                  "feature_tag_ids": [],
                  "type_tag_ids": [],
                  "limit": 3,
                  "client": null
                },
                "matched_tags": {},
                "unmatched_terms": [],
                "explanation": null,
                "provider_status": "disabled"
              },
              "request_id": "ai-disabled-001",
              "results": []
            }
            """.trimIndent(),
        )

        val response = AiRecommendResponse.fromJson(json)

        assertEquals("ai-disabled-001", response.requestId)
        assertTrue(response.results.isEmpty())
        assertEquals("disabled", response.parsedIntent.providerStatus)
        assertFalse(response.parsedIntent.isOk)
    }

    // -----------------------------------------------------------------------
    // helpers
    // -----------------------------------------------------------------------

    private fun threeResultAiRecommendJson(): String =
        """
        {
          "parsed_intent": {
            "structured_request": {
              "scene_tag_ids": [1],
              "feature_tag_ids": [2],
              "type_tag_ids": [],
              "limit": 3,
              "client": "android"
            },
            "matched_tags": {
              "scene": [{"id": 1, "name": "Focus", "group": "scene"}],
              "feature": [{"id": 2, "name": "Calm", "group": "feature"}]
            },
            "unmatched_terms": [],
            "explanation": "Matched to Focus+Calm.",
            "provider_status": "ok"
          },
          "request_id": "ai-req-001",
          "results": [
            {
              "rank": 1,
              "score": 12.5,
              "reason": "Matched scene and feature tags.",
              "track": ${trackJson(101, "Morning Focus", "The Testers")}
            },
            {
              "rank": 2,
              "score": 9.0,
              "reason": "Matched scene tag.",
              "track": ${trackJson(102, "Quiet Work", null)}
            },
            {
              "rank": 3,
              "score": 7.25,
              "reason": "Liked track boost applied.",
              "track": ${trackJson(103, "Deep Flow", "Easy Music")}
            }
          ]
        }
        """.trimIndent()

    private fun trackJson(
        id: Int,
        title: String,
        artist: String?,
    ): String {
        val artistJson = artist?.let { """"$it"""" } ?: "null"
        return """
        {
          "id": $id,
          "title": "$title",
          "artist": $artistJson,
          "album": null,
          "duration_seconds": 180,
          "content_type": "music",
          "original_file_path": null,
          "playback_file_path": "/media/playback-$id.mp3",
          "cover_path": null,
          "source_url": null,
          "format": "mp3",
          "bitrate": 192000,
          "status": "ready",
          "liked": false,
          "cooldown_until": null,
          "created_at": "2026-05-29T08:00:00Z",
          "updated_at": "2026-05-29T09:00:00Z",
          "tags": [
            {
              "id": 1,
              "name": "focus",
              "group": "scene",
              "created_at": "2026-05-29T07:00:00Z"
            }
          ]
        }
        """.trimIndent()
    }
}
