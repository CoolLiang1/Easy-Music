package com.easymusic.app.cache.data

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

@Database(
    entities = [
        CachedTrackEntity::class,
        OfflinePlaybackEventEntity::class,
    ],
    version = 2,
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
                )
                    .addMigrations(MIGRATION_1_2)
                    .build()
                    .also { instance = it }
            }

        private val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL(
                    "ALTER TABLE offline_playback_events ADD COLUMN client TEXT NOT NULL DEFAULT 'android'",
                )
                db.execSQL(
                    "ALTER TABLE offline_playback_events ADD COLUMN playbackSource TEXT",
                )
            }
        }
    }
}
