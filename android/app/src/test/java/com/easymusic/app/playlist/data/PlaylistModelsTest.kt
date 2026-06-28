package com.easymusic.app.playlist.data

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class PlaylistModelsTest {
    @Test
    fun parsesPlaylistSummary() {
        val summary = PlaylistSummaryResponse.fromJson(
            JSONObject(
                """
                {
                  "id": 7,
                  "name": "Night Coding",
                  "description": "Late focus sessions",
                  "track_count": 3,
                  "created_at": "2026-06-26T10:00:00Z",
                  "updated_at": "2026-06-26T11:00:00Z"
                }
                """.trimIndent(),
            ),
        )

        assertEquals(7, summary.id)
        assertEquals("Night Coding", summary.name)
        assertEquals("Late focus sessions", summary.description)
        assertEquals(3, summary.trackCount)
    }

    @Test
    fun parsesPlaylistDetailWithTracks() {
        val playlist = PlaylistResponse.fromJson(JSONObject(playlistJson()))

        assertEquals(7, playlist.id)
        assertEquals("Night Coding", playlist.name)
        assertEquals("Late focus sessions", playlist.description)
        assertEquals(2, playlist.trackCount)
        assertEquals(listOf(1, 2), playlist.tracks.map { it.position })
        assertEquals("First Track", playlist.tracks[0].track.title)
        assertEquals("Second Artist", playlist.tracks[1].track.artist)
        assertTrue(playlist.tracks.all { it.track.isReady })
    }

    private fun playlistJson(): String =
        """
        {
          "id": 7,
          "name": "Night Coding",
          "description": "Late focus sessions",
          "track_count": 2,
          "created_at": "2026-06-26T10:00:00Z",
          "updated_at": "2026-06-26T11:00:00Z",
          "tracks": [
            {
              "position": 1,
              "added_at": "2026-06-26T10:05:00Z",
              "track": ${trackJson(101, "First Track", "First Artist")}
            },
            {
              "position": 2,
              "added_at": "2026-06-26T10:06:00Z",
              "track": ${trackJson(102, "Second Track", "Second Artist")}
            }
          ]
        }
        """.trimIndent()

    private fun trackJson(
        id: Int,
        title: String,
        artist: String,
    ): String =
        """
        {
          "id": $id,
          "title": "$title",
          "artist": "$artist",
          "album": null,
          "duration_seconds": 180,
          "content_type": "song",
          "original_file_path": "/media/original-$id.wav",
          "playback_file_path": "/media/playback-$id.mp3",
          "cover_path": null,
          "source_url": null,
          "format": "mp3",
          "bitrate": 192000,
          "status": "ready",
          "liked": false,
          "cooldown_until": null,
          "created_at": "2026-06-26T09:00:00Z",
          "updated_at": "2026-06-26T09:30:00Z",
          "tags": []
        }
        """.trimIndent()
}
