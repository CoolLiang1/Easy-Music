package com.easymusic.app.playlist.domain

import com.easymusic.app.auth.data.AuthTokenStore
import com.easymusic.app.core.network.ApiResult
import com.easymusic.app.playlist.data.PlaylistApi
import com.easymusic.app.playlist.data.PlaylistResponse
import com.easymusic.app.playlist.data.PlaylistSummaryResponse

class PlaylistRepository(
    private val playlistApi: PlaylistApi,
    private val tokenStore: AuthTokenStore,
) {
    suspend fun listPlaylists(): ApiResult<List<PlaylistSummaryResponse>> {
        val token = tokenStore.readToken()
            ?: return ApiResult.Unauthorized("请重新登录后加载歌单。")

        return playlistApi.listPlaylists(token)
    }

    suspend fun getPlaylist(playlistId: Int): ApiResult<PlaylistResponse> {
        val token = tokenStore.readToken()
            ?: return ApiResult.Unauthorized("请重新登录后加载歌单详情。")

        return playlistApi.getPlaylist(
            playlistId = playlistId,
            bearerToken = token,
        )
    }
}
