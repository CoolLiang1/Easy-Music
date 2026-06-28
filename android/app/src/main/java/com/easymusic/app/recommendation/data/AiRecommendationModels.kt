package com.easymusic.app.recommendation.data

import org.json.JSONArray
import org.json.JSONObject

// ---------------------------------------------------------------------------
// request models
// ---------------------------------------------------------------------------

data class AiParseIntentRequest(
    val text: String,
    val client: String = CLIENT_ANDROID,
    val fallbackToEmpty: Boolean = true,
) {
    fun toJson(): String = JSONObject()
        .put("text", text)
        .put("client", client)
        .put("fallback_to_empty", fallbackToEmpty)
        .toString()

    companion object {
        const val CLIENT_ANDROID = "android"
    }
}

data class AiRecommendRequest(
    val text: String,
    val limit: Int = DEFAULT_AI_LIMIT,
    val client: String = CLIENT_ANDROID,
    val fallbackToEmpty: Boolean = true,
) {
    fun toJson(): String = JSONObject()
        .put("text", text)
        .put("limit", limit)
        .put("client", client)
        .put("fallback_to_empty", fallbackToEmpty)
        .toString()

    companion object {
        const val DEFAULT_AI_LIMIT = 3
        const val CLIENT_ANDROID = "android"
    }
}

// ---------------------------------------------------------------------------
// response models
// ---------------------------------------------------------------------------

data class MatchedTagItem(
    val id: Int,
    val name: String,
    val group: String,
) {
    companion object {
        fun fromJson(json: JSONObject): MatchedTagItem =
            MatchedTagItem(
                id = json.getInt("id"),
                name = json.getString("name"),
                group = json.getString("group"),
            )
    }
}

data class ParsedIntentResponse(
    val structuredRequest: RecommendationRequest,
    val matchedTags: Map<String, List<MatchedTagItem>>,
    val unmatchedTerms: List<String>,
    val explanation: String?,
    val providerStatus: String,
) {
    val isOk: Boolean
        get() = providerStatus == PROVIDER_OK

    companion object {
        const val PROVIDER_OK = "ok"

        fun fromJson(json: JSONObject): ParsedIntentResponse {
            val structuredRequest = parseStructuredRequest(
                json.getJSONObject("structured_request"),
            )

            val matchedTagsJson = json.getJSONObject("matched_tags")
            val matchedTags = mutableMapOf<String, List<MatchedTagItem>>()
            for (key in matchedTagsJson.keys()) {
                val array = matchedTagsJson.getJSONArray(key)
                val items = buildList {
                    for (i in 0 until array.length()) {
                        add(MatchedTagItem.fromJson(array.getJSONObject(i)))
                    }
                }
                matchedTags[key] = items
            }

            val unmatchedTerms = buildList {
                val array = json.getJSONArray("unmatched_terms")
                for (i in 0 until array.length()) {
                    add(array.getString(i))
                }
            }

            return ParsedIntentResponse(
                structuredRequest = structuredRequest,
                matchedTags = matchedTags,
                unmatchedTerms = unmatchedTerms,
                explanation = json.optNullableString("explanation"),
                providerStatus = json.getString("provider_status"),
            )
        }

        private fun parseStructuredRequest(json: JSONObject): RecommendationRequest =
            RecommendationRequest(
                scenarioTagIds = json.getIntArray("scenario_tag_ids"),
                stateTagIds = json.getIntArray("state_tag_ids"),
                typeTagIds = json.getIntArray("type_tag_ids"),
                attributeTagIds = json.getIntArray("attribute_tag_ids"),
                excludeAttributeTagIds = json.getIntArray("exclude_attribute_tag_ids"),
                rawText = json.optNullableString("raw_text"),
                cooldownMode = json.optNullableString("cooldown_mode")
                    ?.let { RecommendationCooldownMode.fromValueOrNull(it) },
                limit = json.getInt("limit"),
                client = json.optNullableString("client") ?: "",
            )
    }
}

data class AiRecommendResponse(
    val parsedIntent: ParsedIntentResponse,
    val requestId: String,
    val results: List<RecommendationResult>,
) {
    companion object {
        fun fromJson(json: JSONObject): AiRecommendResponse {
            val resultsJson = json.getJSONArray("results")
            val results = buildList {
                for (i in 0 until resultsJson.length()) {
                    add(RecommendationResult.fromJson(resultsJson.getJSONObject(i)))
                }
            }

            return AiRecommendResponse(
                parsedIntent = ParsedIntentResponse.fromJson(
                    json.getJSONObject("parsed_intent"),
                ),
                requestId = json.getString("request_id"),
                results = results,
            )
        }
    }
}

// ---------------------------------------------------------------------------
// internal helpers
// ---------------------------------------------------------------------------

internal fun JSONObject.getIntArray(name: String): List<Int> =
    buildList {
        val array = getJSONArray(name)
        for (i in 0 until array.length()) {
            add(array.getInt(i))
        }
    }

private fun JSONObject.optNullableString(name: String): String? =
    if (isNull(name)) null else getString(name)
