package com.easymusic.app.auth.data

import com.easymusic.app.core.network.ApiClient
import com.easymusic.app.core.network.ApiResult
import com.easymusic.app.core.network.map
import org.json.JSONException
import org.json.JSONObject

class AuthApi(
    private val apiClient: ApiClient,
) {
    fun login(request: LoginRequest): ApiResult<TokenResponse> =
        apiClient.postJson(
            path = "/api/auth/login",
            jsonBody = request.toJson(),
        ).parseJson(TokenResponse::fromJson)

    fun logout(bearerToken: String): ApiResult<Unit> =
        apiClient.post(
            path = "/api/auth/logout",
            bearerToken = bearerToken,
        ).map { Unit }

    fun me(bearerToken: String): ApiResult<CurrentUserResponse> =
        apiClient.get(
            path = "/api/auth/me",
            bearerToken = bearerToken,
        ).parseJson(CurrentUserResponse::fromJson)
}

private inline fun <T> ApiResult<String>.parseJson(
    parser: (JSONObject) -> T,
): ApiResult<T> = when (this) {
    is ApiResult.Success -> try {
        ApiResult.Success(parser(JSONObject(value)))
    } catch (exception: JSONException) {
        ApiResult.SerializationError(
            message = exception.message ?: "Response JSON could not be parsed.",
            body = value,
            cause = exception,
        )
    }

    is ApiResult.Unauthorized -> this
    is ApiResult.HttpError -> this
    is ApiResult.NetworkError -> this
    is ApiResult.SerializationError -> this
}
