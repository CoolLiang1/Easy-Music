package com.easymusic.app.player.domain

import android.content.Context
import com.easymusic.app.auth.data.AuthTokenStore
import com.easymusic.app.cache.data.CacheFileStore
import com.easymusic.app.cache.data.EasyMusicDatabase
import com.easymusic.app.cache.domain.TrackCacheRepository
import com.easymusic.app.core.config.AppConfig
import com.easymusic.app.core.network.ApiClient
import com.easymusic.app.library.data.TrackApi
import com.easymusic.app.library.data.TrackResponse
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** Outcome of a playback request, phrased for a snackbar. */
data class PlaybackLaunchResult(
    val message: String?,
    val isError: Boolean = false,
)

/**
 * Starts playback from any screen. Source selection is cache-first, exactly
 * like the Now Playing screen, so list play buttons behave the same offline.
 */
class TrackPlaybackLauncher(
    private val playerController: PlayerController,
    private val playbackSourceSelector: PlaybackSourceSelector,
    private val readToken: suspend () -> String?,
    private val streamUrlForTrack: (Int) -> String,
) {
    suspend fun play(
        track: TrackResponse,
        isNetworkAvailable: Boolean,
    ): PlaybackLaunchResult {
        if (!track.isReady) {
            return PlaybackLaunchResult("这首还在处理，暂时不能播放。", isError = true)
        }

        return when (val source = playbackSourceSelector.select(track, isNetworkAvailable)) {
            is SelectedPlaybackSource.Cached -> {
                playerController.playCached(track = source.track, audioFile = source.audioFile)
                PlaybackLaunchResult(null)
            }

            is SelectedPlaybackSource.Online -> {
                playerController.play(
                    track = source.track,
                    bearerToken = source.bearerToken,
                    streamUrl = source.streamUrl,
                )
                PlaybackLaunchResult(null)
            }

            is SelectedPlaybackSource.Failure -> {
                playerController.fail(track = source.track, message = source.message)
                PlaybackLaunchResult(source.message, isError = true)
            }
        }
    }

    suspend fun playNext(
        track: TrackResponse,
        isNetworkAvailable: Boolean,
    ): PlaybackLaunchResult = enqueue(track, isNetworkAvailable, insertNext = true)

    suspend fun addToQueue(
        track: TrackResponse,
        isNetworkAvailable: Boolean,
    ): PlaybackLaunchResult = enqueue(track, isNetworkAvailable, insertNext = false)

    suspend fun playQueue(
        tracks: List<TrackResponse>,
        mode: PlaybackQueueMode,
        isNetworkAvailable: Boolean,
        playlistId: Int? = null,
        playlistName: String? = null,
    ): PlaybackLaunchResult {
        val playable = tracks.filter { it.isReady }
        if (playable.isEmpty()) {
            return PlaybackLaunchResult("没有可播放的音轨。", isError = true)
        }
        if (!isNetworkAvailable) {
            return PlaybackLaunchResult("当前离线，连续播放需要网络。可在「离线」里播放已缓存的音轨。", isError = true)
        }
        val token = withContext(Dispatchers.IO) { readToken() }
            ?: return PlaybackLaunchResult("登录已失效，请重新登录后再播放。", isError = true)

        playerController.playQueue(
            tracks = playable,
            bearerToken = token,
            streamUrlForTrack = streamUrlForTrack,
            mode = mode,
            playlistId = playlistId,
            playlistName = playlistName,
        )
        val skipped = tracks.size - playable.size
        return PlaybackLaunchResult(if (skipped > 0) "已跳过 $skipped 首未就绪的音轨。" else null)
    }

    private suspend fun enqueue(
        track: TrackResponse,
        isNetworkAvailable: Boolean,
        insertNext: Boolean,
    ): PlaybackLaunchResult {
        if (!track.isReady) {
            return PlaybackLaunchResult("这首还在处理，暂时不能加入队列。", isError = true)
        }
        if (PlaybackStateStore.state.value.currentQueueItem == null) {
            return play(track, isNetworkAvailable).let { result ->
                if (result.isError) result else PlaybackLaunchResult("队列为空，已直接开始播放。")
            }
        }
        if (!isNetworkAvailable) {
            return PlaybackLaunchResult("当前离线，加入队列需要网络。", isError = true)
        }
        val token = withContext(Dispatchers.IO) { readToken() }
            ?: return PlaybackLaunchResult("登录已失效，请重新登录后再试。", isError = true)

        if (insertNext) {
            playerController.playNext(track = track, bearerToken = token, streamUrl = streamUrlForTrack(track.id))
        } else {
            playerController.addToQueue(track = track, bearerToken = token, streamUrl = streamUrlForTrack(track.id))
        }
        return PlaybackLaunchResult(if (insertNext) "下一首播放：${track.title}" else "已加入队列：${track.title}")
    }

    companion object {
        fun create(context: Context): TrackPlaybackLauncher {
            val appContext = context.applicationContext
            val database = EasyMusicDatabase.getInstance(appContext)
            val trackApi = TrackApi(ApiClient(AppConfig.default()))
            val tokenStore = AuthTokenStore(appContext)
            val cacheRepository = TrackCacheRepository(
                cachedTrackDao = database.cachedTrackDao(),
                cacheFileStore = CacheFileStore(appContext),
            )
            return TrackPlaybackLauncher(
                playerController = PlayerController(appContext),
                playbackSourceSelector = PlaybackSourceSelector(
                    trackCacheRepository = cacheRepository,
                    readToken = tokenStore::readToken,
                    streamUrlForTrack = trackApi::streamUrl,
                ),
                readToken = tokenStore::readToken,
                streamUrlForTrack = trackApi::streamUrl,
            )
        }
    }
}
