package com.easymusic.app.cache.data

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert

@Dao
interface CachedTrackDao {
    @Upsert
    suspend fun upsert(track: CachedTrackEntity)

    @Query("SELECT * FROM cached_tracks ORDER BY title COLLATE NOCASE ASC")
    suspend fun listTracks(): List<CachedTrackEntity>

    @Query("SELECT * FROM cached_tracks WHERE trackId = :trackId")
    suspend fun getTrack(trackId: Int): CachedTrackEntity?

    @Query("DELETE FROM cached_tracks WHERE trackId = :trackId")
    suspend fun deleteTrack(trackId: Int): Int
}
