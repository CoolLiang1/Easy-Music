package com.easymusic.app.recommendation.data

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class RecommendationModelsTest {
    @Test
    fun serializesOptionalCooldownModeAndRawText() {
        val json = JSONObject(
            RecommendationRequest(
                sceneTagIds = listOf(1),
                rawText = "focus coding",
                cooldownMode = RecommendationCooldownMode.Strict,
            ).toJson(),
        )

        assertEquals("focus coding", json.getString("raw_text"))
        assertEquals("strict", json.getString("cooldown_mode"))
        assertEquals(1, json.getJSONArray("scene_tag_ids").getInt(0))
    }

    @Test
    fun parsesRecommendationResponseWithThreeTracks() {
        val response = RecommendationResponse.fromJson(JSONObject(threeTrackResponseJson()))

        assertEquals("request-123", response.requestId)
        assertEquals(3, response.results.size)
        assertEquals(listOf(1, 2, 3), response.results.map { it.rank })
        assertEquals(12.5, response.results[0].score, 0.0)
        assertEquals("Matched scene and type tags.", response.results[0].reason)
        assertEquals(
            "focus",
            response.results[0].explanation?.matchedTags?.get("scene")?.single()?.name,
        )
        assertEquals(
            "playlist context boost: Work Flow",
            response.results[0].explanation?.boosts?.single()?.label,
        )
        assertEquals(1.5, response.results[0].explanation?.boosts?.single()?.scoreDelta ?: 0.0, 0.0)
        assertEquals(
            "active cooldown soft penalty",
            response.results[0].explanation?.penalties?.single()?.label,
        )
        assertEquals("Morning Focus", response.results[0].track.title)
        assertEquals("The Testers", response.results[0].track.artist)
        assertEquals("focus", response.results[0].track.tags.single().name)
        assertEquals("scene", response.results[0].track.tags.single().group)
        assertTrue(response.results.all { it.track.isReady })
    }

    @Test
    fun parsesEmptyRecommendationResponse() {
        val response = RecommendationResponse.fromJson(
            JSONObject(
                """
                {
                  "request_id": "request-empty",
                  "results": []
                }
                """.trimIndent(),
            ),
        )

        assertEquals("request-empty", response.requestId)
        assertTrue(response.results.isEmpty())
    }

    private fun threeTrackResponseJson(): String =
        """
        {
          "request_id": "request-123",
          "results": [
            {
              "rank": 1,
              "score": 12.5,
              "reason": "Matched scene and type tags.",
              "explanation": {
                "matched_tags": {
                  "scene": [
                    {
                      "id": 1,
                      "name": "focus",
                      "group": "scene"
                    }
                  ]
                },
                "boosts": [
                  {
                    "label": "playlist context boost: Work Flow",
                    "score_delta": 1.5
                  }
                ],
                "penalties": [
                  {
                    "label": "active cooldown soft penalty",
                    "score_delta": -1.0
                  }
                ],
                "feedback_impacts": [
                  {
                    "label": "dislike feedback penalty",
                    "score_delta": -8.0
                  }
                ],
                "avoidance_reasons": []
              },
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
          "original_file_path": "/media/original-$id.wav",
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
