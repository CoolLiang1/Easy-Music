package com.easymusic.app.cache.data

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

@Dao
interface CachedTrackDao {
    @Upsert
    suspend fun upsert(track: CachedTrackEntity)

    @Query("SELECT * FROM cached_tracks ORDER BY title COLLATE NOCASE ASC")
    suspend fun listTracks(): List<CachedTrackEntity>

    @Query("SELECT * FROM cached_tracks")
    fun observeTracks(): Flow<List<CachedTrackEntity>>

    @Query("SELECT * FROM cached_tracks WHERE trackId = :trackId")
    suspend fun getTrack(trackId: Int): CachedTrackEntity?

    @Query("SELECT * FROM cached_tracks WHERE trackId = :trackId")
    fun observeTrack(trackId: Int): Flow<CachedTrackEntity?>

    @Query("DELETE FROM cached_tracks WHERE trackId = :trackId")
    suspend fun deleteTrack(trackId: Int): Int
}
