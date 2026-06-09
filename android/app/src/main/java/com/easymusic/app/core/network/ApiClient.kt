package com.easymusic.app.core.network

import com.easymusic.app.core.config.AppConfig
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

class ApiClient(
    val config: AppConfig,
) {
    val baseUrl: String = config.apiBaseUrl.trimEnd('/')

    fun get(
        path: String,
        bearerToken: String? = null,
    ): ApiResult<String> = request(
        method = "GET",
        path = path,
        bearerToken = bearerToken,
    )

    fun postJson(
        path: String,
        jsonBody: String,
        bearerToken: String? = null,
    ): ApiResult<String> = request(
        method = "POST",
        path = path,
        bearerToken = bearerToken,
        jsonBody = jsonBody,
    )

    fun post(
        path: String,
        bearerToken: String? = null,
    ): ApiResult<String> = request(
        method = "POST",
        path = path,
        bearerToken = bearerToken,
    )

    fun buildUrl(path: String): String = "$baseUrl/${path.trimStart('/')}"

    private fun request(
        method: String,
        path: String,
        bearerToken: String? = null,
        jsonBody: String? = null,
    ): ApiResult<String> {
        val connection = try {
            (URL(buildUrl(path)).openConnection() as HttpURLConnection).apply {
                requestMethod = method
                connectTimeout = CONNECT_TIMEOUT_MS
                readTimeout = READ_TIMEOUT_MS
                setRequestProperty("Accept", "application/json")
                bearerToken?.let { setRequestProperty("Authorization", "Bearer $it") }

                if (jsonBody != null) {
                    doOutput = true
                    setRequestProperty("Content-Type", "application/json")
                    outputStream.use { output ->
                        output.write(jsonBody.toByteArray(Charsets.UTF_8))
                    }
                }
            }
        } catch (exception: IOException) {
            return ApiResult.NetworkError(
                message = exception.message ?: "网络请求失败。",
                cause = exception,
            )
        }

        return try {
            val statusCode = connection.responseCode
            val responseBody = readResponseBody(connection, statusCode)

            when {
                statusCode in 200..299 -> ApiResult.Success(responseBody)
                statusCode == HttpURLConnection.HTTP_UNAUTHORIZED -> ApiResult.Unauthorized(
                    message = responseBody.errorMessageOrDefault("需要登录后继续。"),
                )

                else -> ApiResult.HttpError(
                    statusCode = statusCode,
                    message = responseBody.errorMessageOrDefault("请求失败。"),
                    body = responseBody,
                )
            }
        } catch (exception: IOException) {
            ApiResult.NetworkError(
                message = exception.message ?: "网络请求失败。",
                cause = exception,
            )
        } finally {
            connection.disconnect()
        }
    }

    private fun readResponseBody(
        connection: HttpURLConnection,
        statusCode: Int,
    ): String {
        val stream = if (statusCode in 200..299) {
            connection.inputStream
        } else {
            connection.errorStream ?: connection.inputStream
        }

        return stream.bufferedReader(Charsets.UTF_8).use { it.readText() }
    }

    companion object {
        private const val CONNECT_TIMEOUT_MS = 15_000
        private const val READ_TIMEOUT_MS = 30_000
    }
}
