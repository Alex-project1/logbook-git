package com.oh.routemaster.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Badge
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.oh.routemaster.data.remote.ApiClient
import com.oh.routemaster.data.remote.MobileNotificationDto
import com.oh.routemaster.data.remote.ReplyNotificationRequest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@Composable
fun NotificationsScreen(
    accessToken: String,
    onBack: () -> Unit
) {
    val scope = rememberCoroutineScope()

    var notifications by remember { mutableStateOf<List<MobileNotificationDto>>(emptyList()) }
    var selectedNotification by remember { mutableStateOf<MobileNotificationDto?>(null) }

    var loading by remember { mutableStateOf(true) }
    var actionLoading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf("") }
    var replyText by remember { mutableStateOf("") }

    suspend fun loadNotifications() {
        loading = true
        error = ""

        try {
            val response = withContext(Dispatchers.IO) {
                ApiClient.api.getNotifications(
                    authorization = "Bearer $accessToken",
                    page = 1,
                    pageSize = 50
                )
            }

            notifications = response.data
        } catch (exception: Exception) {
            error = "Не вдалося завантажити повідомлення: ${exception.message}"
            exception.printStackTrace()
        } finally {
            loading = false
        }
    }

    LaunchedEffect(Unit) {
        loadNotifications()
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        NotificationsHeader(
            onRefresh = {
                scope.launch {
                    loadNotifications()
                }
            },
            onBack = onBack
        )

        if (error.isNotBlank()) {
            Text(
                text = error,
                color = MaterialTheme.colorScheme.error
            )
        }

        if (loading) {
            LoadingState()
        } else if (notifications.isEmpty() && error.isBlank()) {
            Text("Повідомлень поки немає")
        } else if (notifications.isNotEmpty()) {
            LazyColumn(
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                items(notifications) { notification ->
                    NotificationListItem(
                        notification = notification,
                        onClick = {
                            selectedNotification = notification
                            replyText = notification.replyText.orEmpty()
                        }
                    )
                }
            }
        }
    }

    selectedNotification?.let { notification ->
        NotificationDetailsDialog(
            notification = notification,
            replyText = replyText,
            actionLoading = actionLoading,
            onReplyTextChange = { replyText = it },
            onDismiss = {
                selectedNotification = null
                replyText = ""
            },
            onRead = {
                scope.launch {
                    actionLoading = true

                    try {
                        val updated = withContext(Dispatchers.IO) {
                            ApiClient.api.markNotificationAsRead(
                                authorization = "Bearer $accessToken",
                                id = notification.id
                            ).data
                        }

                        selectedNotification = updated
                        loadNotifications()
                    } catch (exception: Exception) {
                        error = "Не вдалося відмітити повідомлення"
                        exception.printStackTrace()
                    } finally {
                        actionLoading = false
                    }
                }
            },
            onReply = {
                if (replyText.isBlank()) {
                    error = "Введіть текст відповіді"
                    return@NotificationDetailsDialog
                }

                scope.launch {
                    actionLoading = true

                    try {
                        val updated = withContext(Dispatchers.IO) {
                            ApiClient.api.replyNotification(
                                authorization = "Bearer $accessToken",
                                id = notification.id,
                                body = ReplyNotificationRequest(
                                    replyText = replyText.trim()
                                )
                            ).data
                        }

                        selectedNotification = updated
                        loadNotifications()
                    } catch (exception: Exception) {
                        error = "Не вдалося надіслати відповідь"
                        exception.printStackTrace()
                    } finally {
                        actionLoading = false
                    }
                }
            }
        )
    }
}

@Composable
private fun NotificationsHeader(
    onRefresh: () -> Unit,
    onBack: () -> Unit
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = "Повідомлення",
            style = MaterialTheme.typography.headlineSmall
        )

        Row(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            TextButton(onClick = onRefresh) {
                Text("Оновити")
            }

            TextButton(onClick = onBack) {
                Text("Назад")
            }
        }
    }
}

@Composable
private fun LoadingState() {
    Column(
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        CircularProgressIndicator()
        Spacer(modifier = Modifier.height(8.dp))
        Text("Завантаження...")
    }
}

@Composable
private fun NotificationDetailsDialog(
    notification: MobileNotificationDto,
    replyText: String,
    actionLoading: Boolean,
    onReplyTextChange: (String) -> Unit,
    onDismiss: () -> Unit,
    onRead: () -> Unit,
    onReply: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(notification.title)
        },
        text = {
            Column(
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Text(notification.message)

                Text("Статус: ${getNotificationStatusLabel(notification)}")
                Text("Надіслано: ${formatMobileDate(notification.sentAt)}")
                Text("Ознайомився: ${formatMobileDate(notification.readAt)}")
                Text("Відповів: ${formatMobileDate(notification.repliedAt)}")

                OutlinedTextField(
                    value = replyText,
                    onValueChange = onReplyTextChange,
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("Відповідь") },
                    enabled = notification.repliedAt == null,
                    minLines = 3
                )
            }
        },
        confirmButton = {
            Column(
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Button(
                    onClick = onRead,
                    enabled = !actionLoading && notification.readAt == null
                ) {
                    Text("Ознайомився")
                }

                Button(
                    onClick = onReply,
                    enabled = !actionLoading && notification.repliedAt == null
                ) {
                    Text("Відповісти")
                }
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Закрити")
            }
        }
    )
}

@Composable
private fun NotificationListItem(
    notification: MobileNotificationDto,
    onClick: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        shape = MaterialTheme.shapes.large
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = getNotificationStatusLabel(notification),
                    color = MaterialTheme.colorScheme.primary,
                    style = MaterialTheme.typography.labelLarge
                )

                if (notification.readAt == null) {
                    Badge {
                        Text("Нове")
                    }
                }
            }

            Text(
                text = notification.title,
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurface
            )

            Text(
                text = "Надійшло: ${formatMobileDate(notification.sentAt)}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

private fun getNotificationStatusLabel(notification: MobileNotificationDto): String {
    return when {
        notification.repliedAt != null -> "Відповідь надіслано"
        notification.readAt != null -> "Ознайомлено"
        else -> "Нове повідомлення"
    }
}

private fun formatMobileDate(value: String?): String {
    if (value.isNullOrBlank()) {
        return "—"
    }

    return value.replace("T", " ").take(16)
}
