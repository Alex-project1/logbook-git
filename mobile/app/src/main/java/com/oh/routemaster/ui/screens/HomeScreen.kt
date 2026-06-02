package com.oh.routemaster.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun HomeScreen(
    status: String,
    unreadCount: Int,
    onLogout: () -> Unit,
    onRegisterFcm: () -> Unit,
    onRefreshUnread: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(20.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            text = "Route Master",
            style = MaterialTheme.typography.headlineMedium
        )

        Spacer(modifier = Modifier.height(16.dp))

        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = MaterialTheme.shapes.large
        ) {
            Column(
                modifier = Modifier.padding(18.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Text(
                    text = "Головна",
                    style = MaterialTheme.typography.titleLarge
                )

                Text(
                    text = status,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )

                Text(
                    text = "Непрочитаних повідомлень: $unreadCount",
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }

        Spacer(modifier = Modifier.height(18.dp))

        Button(
            onClick = onRefreshUnread,
            modifier = Modifier.fillMaxWidth()
        ) {
            Text("Оновити дані")
        }

        Button(
            onClick = onRegisterFcm,
            modifier = Modifier.fillMaxWidth()
        ) {
            Text("Оновити push-токен")
        }

        TextButton(onClick = onLogout) {
            Text("Вийти")
        }
    }
}