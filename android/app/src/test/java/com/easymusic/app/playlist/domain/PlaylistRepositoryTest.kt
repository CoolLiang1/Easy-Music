package com.easymusic.app.playlist.domain

import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import com.easymusic.app.auth.data.AuthTokenStore
import com.easymusic.app.core.network.ApiResult
import com.easymusic.app.playlist.data.PlaylistApi
import com.easymusic.app.playlist.data.PlaylistResponse
import com.easymusic.app.playlist.data.PlaylistSummaryResponse
import java.io.File
import kotlin.io.path.createTempDirectory
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
class PlaylistRepositoryTest {
    private val storeDirectory = createTempDirectory("playlist-repository-test").toFile()

    @Test
    fun listPlaylistsUsesBearerToken() = runTest {
        val api = FakePlaylistApi(
            listResult = ApiResult.Success(
                listOf(
                    PlaylistSummaryResponse(
                        id = 1,
                        name = "Focus",
                        trackCount = 2,
                        createdAt = "2026-06-26T10:00:00Z",
                        updatedAt = "2026-06-26T11:00:00Z",
                    ),
                ),
            ),
        )
        val repository = repository(
            api = api,
            tokenStore = tokenStore("token-123"),
        )

        val result = repository.listPlaylists()

        assertTrue(result is ApiResult.Success)
        assertEquals("token-123", api.capturedListBearerToken)
    }

    @Test
    fun getPlaylistUsesBearerTokenAndPlaylistId() = runTest {
        val api = FakePlaylistApi(
            getResult = ApiResult.Success(
                PlaylistResponse(
                    id = 42,
                    name = "Night",
                    trackCount = 0,
                    tracks = emptyList(),
                    createdAt = "2026-06-26T10:00:00Z",
                    updatedAt = "2026-06-26T11:00:00Z",
                ),
            ),
        )
        val repository = repository(
            api = api,
            tokenStore = tokenStore("token-456"),
        )

        val result = repository.getPlaylist(42)

        assertTrue(result is ApiResult.Success)
        assertEquals("token-456", api.capturedGetBearerToken)
        assertEquals(42, api.capturedPlaylistId)
    }

    @Test
    fun listPlaylistsReturnsUnauthorizedWithoutCallingApiWhenTokenIsMissing() = runTest {
        val api = FakePlaylistApi()
        val repository = repository(
            api = api,
            tokenStore = tokenStore(),
        )

        val result = repository.listPlaylists()

        assertTrue(result is ApiResult.Unauthorized)
        assertNull(api.capturedListBearerToken)
    }

    @Test
    fun getPlaylistReturnsUnauthorizedWithoutCallingApiWhenTokenIsMissing() = runTest {
        val api = FakePlaylistApi()
        val repository = repository(
            api = api,
            tokenStore = tokenStore(),
        )

        val result = repository.getPlaylist(42)

        assertTrue(result is ApiResult.Unauthorized)
        assertNull(api.capturedPlaylistId)
    }

    private fun repository(
        api: PlaylistApi,
        tokenStore: AuthTokenStore,
    ): PlaylistRepository =
        PlaylistRepository(
            playlistApi = api,
            tokenStore = tokenStore,
        )

    private suspend fun TestScope.tokenStore(token: String? = null): AuthTokenStore {
        val dataStore = PreferenceDataStoreFactory.create(
            scope = backgroundScope,
            produceFile = { File(storeDirectory, "auth-${System.nanoTime()}.preferences_pb") },
        )
        return AuthTokenStore(dataStore).also { tokenStore ->
            token?.let { tokenStore.saveToken(it) }
        }
    }

    private class FakePlaylistApi(
        private val listResult: ApiResult<List<PlaylistSummaryResponse>> =
            ApiResult.Success(emptyList()),
        private val getResult: ApiResult<PlaylistResponse> =
            ApiResult.Success(
                PlaylistResponse(
                    id = 1,
                    name = "Unused",
                    trackCount = 0,
                    tracks = emptyList(),
                    createdAt = "2026-06-26T10:00:00Z",
                    updatedAt = "2026-06-26T11:00:00Z",
                ),
            ),
    ) : PlaylistApi {
        var capturedListBearerToken: String? = null
            private set
        var capturedGetBearerToken: String? = null
            private set
        var capturedPlaylistId: Int? = null
            private set

        override fun listPlaylists(
            bearerToken: String,
        ): ApiResult<List<PlaylistSummaryResponse>> {
            capturedListBearerToken = bearerToken
            return listResult
        }

        override fun getPlaylist(
            playlistId: Int,
            bearerToken: String,
        ): ApiResult<PlaylistResponse> {
            capturedPlaylistId = playlistId
            capturedGetBearerToken = bearerToken
            return getResult
        }
    }
}
