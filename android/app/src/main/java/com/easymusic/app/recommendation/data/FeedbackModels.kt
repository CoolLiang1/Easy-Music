package com.easymusic.app.recommendation.data

import org.json.JSONArray
import org.json.JSONObject

enum class FeedbackType(val value: String) {
    Like("like"),
    Tired("tired"),
    NotToday("not_today"),
    NotSuitableForContext("not_suitable_for_context"),
    SkipRecommendation("skip_recommendation"),
}

data class FeedbackEventRequest(
    val clientEventId: String? = null,
    val trackId: Int,
    val feedbackType: FeedbackType,
    val scenarioTagIds: List<Int>? = null,
    val stateTagIds: List<Int>? = null,
    val typeTagIds: List<Int>? = null,
    val attributeTagIds: List<Int>? = null,
    val occurredAt: String,
    val client: String = RecommendationRequest.CLIENT_ANDROID,
) {
    fun toJsonObject(): JSONObject {
        val json = JSONObject()
            .put("track_id", trackId)
            .put("feedback_type", feedbackType.value)
            .put("occurred_at", occurredAt)
            .put("client", client)

        clientEventId?.let { json.put("client_event_id", it) }
        scenarioTagIds?.let { json.put("scenario_tag_ids", it.toJsonArray()) }
        stateTagIds?.let { json.put("state_tag_ids", it.toJsonArray()) }
        typeTagIds?.let { json.put("type_tag_ids", it.toJsonArray()) }
        attributeTagIds?.let { json.put("attribute_tag_ids", it.toJsonArray()) }

        return json
    }
}

data class FeedbackBulkRequest(
    val events: List<FeedbackEventRequest>,
) {
    fun toJson(): String {
        val eventArray = JSONArray()
        events.forEach { eventArray.put(it.toJsonObject()) }
        return JSONObject()
            .put("events", eventArray)
            .toString()
    }
}

data class FeedbackResponse(
    val accepted: List<FeedbackAcceptedResponse>,
    val failed: List<FeedbackFailedResponse>,
) {
    companion object {
        fun fromJson(json: JSONObject): FeedbackResponse =
            FeedbackResponse(
                accepted = json.getJSONArray("accepted").toAcceptedFeedback(),
                failed = json.getJSONArray("failed").toFailedFeedback(),
            )
    }
}

data class FeedbackAcceptedResponse(
    val clientEventId: String?,
    val status: String,
)

data class FeedbackFailedResponse(
    val clientEventId: String?,
    val trackId: Int,
    val status: String,
    val error: String,
)

private fun JSONArray.toAcceptedFeedback(): List<FeedbackAcceptedResponse> =
    buildList {
        for (index in 0 until length()) {
            val item = getJSONObject(index)
            add(
                FeedbackAcceptedResponse(
                    clientEventId = item.optionalString("client_event_id"),
                    status = item.getString("status"),
                ),
            )
        }
    }

private fun JSONArray.toFailedFeedback(): List<FeedbackFailedResponse> =
    buildList {
        for (index in 0 until length()) {
            val item = getJSONObject(index)
            add(
                FeedbackFailedResponse(
                    clientEventId = item.optionalString("client_event_id"),
                    trackId = item.getInt("track_id"),
                    status = item.getString("status"),
                    error = item.getString("error"),
                ),
            )
        }
    }

private fun JSONObject.optionalString(name: String): String? =
    if (isNull(name)) null else getString(name)
