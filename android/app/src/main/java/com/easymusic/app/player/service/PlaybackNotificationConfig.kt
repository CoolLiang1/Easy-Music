package com.easymusic.app.player.service

import android.content.Context
import androidx.annotation.OptIn
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.session.CommandButton
import androidx.media3.session.DefaultMediaNotificationProvider
import androidx.media3.session.MediaNotification

@OptIn(UnstableApi::class)
object PlaybackNotificationConfig {
    const val NotificationId = 1001
    const val ChannelId = "easy_music_playback"

    fun provider(context: Context): MediaNotification.Provider {
        return DefaultMediaNotificationProvider.Builder(context)
            .setNotificationId(NotificationId)
            .setChannelId(ChannelId)
            .setChannelName(com.easymusic.app.R.string.app_name)
            .build()
    }

    fun mediaButtonPreferences(): List<CommandButton> {
        return listOf(
            CommandButton.Builder(CommandButton.ICON_PLAY)
                .setPlayerCommand(Player.COMMAND_PLAY_PAUSE)
                .setDisplayName("播放/暂停")
                .setSlots(CommandButton.SLOT_CENTRAL)
                .build(),
            CommandButton.Builder(CommandButton.ICON_STOP)
                .setPlayerCommand(Player.COMMAND_STOP)
                .setDisplayName("停止")
                .setSlots(CommandButton.SLOT_BACK)
                .build(),
        )
    }
}
