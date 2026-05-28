package com.easymusic.app.cache.sync

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.easymusic.app.auth.data.AuthTokenStore
import com.easymusic.app.cache.data.EasyMusicDatabase
import com.easymusic.app.cache.data.HttpPlaybackEventSyncApi
import com.easymusic.app.cache.domain.PlaybackEventSyncRepository
import com.easymusic.app.cache.domain.PlaybackEventSyncResult
import com.easymusic.app.core.config.AppConfig
import com.easymusic.app.core.network.ApiClient
import java.util.concurrent.TimeUnit

class PlaybackEventSyncWorker(
    appContext: Context,
    workerParams: WorkerParameters,
) : CoroutineWorker(appContext, workerParams) {
    override suspend fun doWork(): Result {
        val database = EasyMusicDatabase.getInstance(applicationContext)
        val repository = PlaybackEventSyncRepository(
            offlinePlaybackEventDao = database.offlinePlaybackEventDao(),
            playbackEventSyncApi = HttpPlaybackEventSyncApi(ApiClient(AppConfig.default())),
            tokenStore = AuthTokenStore(applicationContext),
        )

        return when (repository.syncPendingEvents()) {
            PlaybackEventSyncResult.NoPendingEvents -> Result.success()
            is PlaybackEventSyncResult.Synced -> Result.success()
            PlaybackEventSyncResult.SignInRequired -> Result.success()
            is PlaybackEventSyncResult.RetryableFailure -> Result.retry()
        }
    }

    companion object {
        private const val UNIQUE_WORK_NAME = "playback-event-sync"

        fun enqueue(context: Context) {
            val request = OneTimeWorkRequestBuilder<PlaybackEventSyncWorker>()
                .setConstraints(
                    Constraints.Builder()
                        .setRequiredNetworkType(NetworkType.CONNECTED)
                        .build(),
                )
                .setBackoffCriteria(
                    BackoffPolicy.EXPONENTIAL,
                    30,
                    TimeUnit.SECONDS,
                )
                .build()

            WorkManager.getInstance(context.applicationContext).enqueueUniqueWork(
                UNIQUE_WORK_NAME,
                ExistingWorkPolicy.KEEP,
                request,
            )
        }
    }
}
