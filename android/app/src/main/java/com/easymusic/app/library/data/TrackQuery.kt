package com.easymusic.app.library.data

import java.net.URLEncoder
import java.nio.charset.StandardCharsets

const val LIBRARY_PAGE_SIZE = 25

enum class TrackSortField(val value: String) {
    CreatedAt("created_at"),
    UpdatedAt("updated_at"),
    Title("title"),
    Artist("artist"),
    Album("album"),
    Duration("duration_seconds"),
}

enum class TrackSortOrder(val value: String) {
    Ascending("asc"),
    Descending("desc"),
}

data class TrackQuery(
    val search: String = "",
    val status: String = "",
    val liked: Boolean? = null,
    val contentType: String = "",
    val tagId: Int? = null,
    val sort: TrackSortField = TrackSortField.CreatedAt,
    val order: TrackSortOrder = TrackSortOrder.Ascending,
    val offset: Int = 0,
    val pageSize: Int = LIBRARY_PAGE_SIZE,
) {
    init {
        require(offset >= 0)
        require(pageSize in 1..100)
        require(tagId == null || tagId > 0)
    }

    fun toPath(): String {
        val parameters = buildList {
            search.trim().takeIf { it.isNotEmpty() }?.let { add("q" to it) }
            status.takeIf { it.isNotEmpty() }?.let { add("status" to it) }
            liked?.let { add("liked" to it.toString()) }
            contentType.takeIf { it.isNotEmpty() }?.let { add("content_type" to it) }
            tagId?.let { add("tag_id" to it.toString()) }
            add("sort" to sort.value)
            add("order" to order.value)
            add("limit" to (pageSize + 1).coerceAtMost(100).toString())
            add("offset" to offset.toString())
        }
        return "/api/tracks?" + parameters.joinToString("&") { (name, value) ->
            "${name.encode()}=${value.encode()}"
        }
    }

    fun activeFilterCount(): Int =
        listOf(
            search.trim().takeIf { it.isNotEmpty() },
            status.takeIf { it.isNotEmpty() },
            liked,
            contentType.takeIf { it.isNotEmpty() },
            tagId,
        ).count { it != null }
}

data class TrackQueryResult(
    val tracks: List<TrackResponse>,
    val hasNextPage: Boolean,
)

private fun String.encode(): String =
    URLEncoder.encode(this, StandardCharsets.UTF_8.toString())
