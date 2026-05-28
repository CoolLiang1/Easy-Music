package com.easymusic.app.cache.data

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase

@Database(
    entities = [
        CachedTrackEntity::class,
        OfflinePlaybackEventEntity::class,
    ],
    version = 1,
    exportSchema = false,
)
abstract class EasyMusicDatabase : RoomDatabase() {
    abstract fun cachedTrackDao(): CachedTrackDao

    abstract fun offlinePlaybackEventDao(): OfflinePlaybackEventDao

    companion object {
        private const val DATABASE_NAME = "easy_music_cache.db"

        @Volatile
        private var instance: EasyMusicDatabase? = null

        fun getInstance(context: Context): EasyMusicDatabase =
            instance ?: synchronized(this) {
                instance ?: Room.databaseBuilder(
                    context.applicationContext,
                    EasyMusicDatabase::class.java,
                    DATABASE_NAME,
                ).build().also { instance = it }
            }
    }
}
