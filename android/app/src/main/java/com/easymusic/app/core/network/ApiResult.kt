package com.easymusic.app.core.network

import org.json.JSONException
import org.json.JSONObject

sealed interface ApiResult<out T> {
    data class Success<T>(val value: T) : ApiResult<T>

    data class Unauthorized(
        val message: String,
    ) : ApiResult<Nothing>

    data class HttpError(
        val statusCode: Int,
        val message: String,
        val body: String,
    ) : ApiResult<Nothing>

    data class NetworkError(
        val message: String,
        val cause: Throwable? = null,
    ) : ApiResult<Nothing>

    data class SerializationError(
        val message: String,
        val body: String,
        val cause: Throwable? = null,
    ) : ApiResult<Nothing>
}

inline fun <T, R> ApiResult<T>.map(transform: (T) -> R): ApiResult<R> = when (this) {
    is ApiResult.Success -> ApiResult.Success(transform(value))
    is ApiResult.Unauthorized -> this
    is ApiResult.HttpError -> this
    is ApiResult.NetworkError -> this
    is ApiResult.SerializationError -> this
}

fun String.errorMessageOrDefault(defaultMessage: String): String {
    if (isBlank()) {
        return defaultMessage
    }

    return try {
        val detail = JSONObject(this).opt("detail")
        when (detail) {
            is String -> detail
            null -> defaultMessage
            else -> detail.toString()
        }
    } catch (_: JSONException) {
        this
    }
}
