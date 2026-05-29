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
    fun parsesRecommendationResponseWithThreeTracks() {
        val response = RecommendationResponse.fromJson(JSONObject(threeTrackResponseJson()))

        assertEquals("request-123", response.requestId)
        assertEquals(3, response.results.size)
        assertEquals(listOf(1, 2, 3), response.results.map { it.rank })
        assertEquals(12.5, response.results[0].score, 0.0)
        assertEquals("Matched scenario and type tags.", response.results[0].reason)
        assertEquals("Morning Focus", response.results[0].track.title)
        assertEquals("The Testers", response.results[0].track.artist)
        assertEquals("focus", response.results[0].track.tags.single().name)
        assertEquals("scenario", response.results[0].track.tags.single().group)
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
              "reason": "Matched scenario and type tags.",
              "track": ${trackJson(101, "Morning Focus", "The Testers")}
            },
            {
              "rank": 2,
              "score": 9.0,
              "reason": "Matched scenario tag.",
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
              "group": "scenario",
              "created_at": "2026-05-29T07:00:00Z"
            }
          ]
        }
        """.trimIndent()
    }
}
