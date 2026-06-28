package com.easymusic.app.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

object AuthRoutes {
    const val LOGIN = "login"
}

@Composable
fun LoginRoute(
    onContinueToLibrary: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(
            text = "登录",
            style = MaterialTheme.typography.headlineMedium,
        )
        Text(
            text = "认证界面将在后续任务中完善。",
            style = MaterialTheme.typography.bodyMedium,
        )
        Button(
            modifier = Modifier.padding(top = 24.dp),
            onClick = onContinueToLibrary,
        ) {
            Text("打开曲库")
        }
    }
}
