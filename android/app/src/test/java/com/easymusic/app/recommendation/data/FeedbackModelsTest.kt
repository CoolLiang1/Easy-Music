package com.easymusic.app.recommendation.data

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class FeedbackModelsTest {
    @Test
    fun buildsFeedbackRequestWithStructuredContext() {
        val request = FeedbackEventRequest(
            clientEventId = "feedback-123",
            trackId = 42,
            feedbackType = FeedbackType.NotSuitableForContext,
            scenarioTagIds = listOf(1, 2),
            stateTagIds = listOf(3),
            typeTagIds = listOf(4),
            attributeTagIds = listOf(5, 6),
            occurredAt = "2026-05-29T08:00:00Z",
        )

        val json = request.toJsonObject()

        assertEquals("feedback-123", json.getString("client_event_id"))
        assertEquals(42, json.getInt("track_id"))
        assertEquals("not_suitable_for_context", json.getString("feedback_type"))
        assertEquals("2026-05-29T08:00:00Z", json.getString("occurred_at"))
        assertEquals("android", json.getString("client"))
        assertEquals(listOf(1, 2), json.getJSONArray("scenario_tag_ids").toIntList())
        assertEquals(listOf(3), json.getJSONArray("state_tag_ids").toIntList())
        assertEquals(listOf(4), json.getJSONArray("type_tag_ids").toIntList())
        assertEquals(listOf(5, 6), json.getJSONArray("attribute_tag_ids").toIntList())
    }

    @Test
    fun parsesFeedbackResponse() {
        val response = FeedbackResponse.fromJson(
            JSONObject(
                """
                {
                  "accepted": [
                    {
                      "client_event_id": "feedback-123",
                      "status": "accepted"
                    }
                  ],
                  "failed": [
                    {
                      "client_event_id": "feedback-456",
                      "track_id": 99,
                      "status": "failed",
                      "error": "Track does not belong to the authenticated user."
                    }
                  ]
                }
                """.trimIndent(),
            ),
        )

        assertEquals(1, response.accepted.size)
        assertEquals("feedback-123", response.accepted.single().clientEventId)
        assertEquals("accepted", response.accepted.single().status)
        assertEquals(1, response.failed.size)
        assertEquals("feedback-456", response.failed.single().clientEventId)
        assertEquals(99, response.failed.single().trackId)
        assertEquals("failed", response.failed.single().status)
        assertEquals(
            "Track does not belong to the authenticated user.",
            response.failed.single().error,
        )
    }
}

private fun org.json.JSONArray.toIntList(): List<Int> =
    buildList {
        for (index in 0 until length()) {
            add(getInt(index))
        }
    }
