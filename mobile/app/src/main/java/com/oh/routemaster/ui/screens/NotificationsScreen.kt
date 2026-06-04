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
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.oh.routemaster.data.remote.ApiClient
import com.oh.routemaster.data.remote.MobileNotificationDto
import com.oh.routemaster.data.remote.PaginationDto
import com.oh.routemaster.data.remote.ReplyNotificationRequest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private const val NOTIFICATIONS_PAGE_SIZE = 10

@Composable
fun NotificationsScreen(
    accessToken: String,
    onBack: () -> Unit
) {
    val scope = rememberCoroutineScope()

    var page by remember { mutableStateOf(1) }
    var notifications by remember { mutableStateOf<List<MobileNotificationDto>>(emptyList()) }
    var pagination by remember {
        mutableStateOf(
            PaginationDto(
                page = 1,
                pageSize = NOTIFICATIONS_PAGE_SIZE,
                total = 0,
                totalPages = 1
            )
        )
    }

    var selectedNotification by remember { mutableStateOf<MobileNotificationDto?>(null) }

    var loading by remember { mutableStateOf(true) }
    var actionLoading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf("") }
    var replyText by remember { mutableStateOf("") }

    suspend fun loadNotifications(targetPage: Int = page) {
        loading = true
        error = ""

        try {
            val response = withContext(Dispatchers.IO) {
                ApiClient.api.getNotifications(
                    authorization = "Bearer $accessToken",
                    page = targetPage,
                    pageSize = NOTIFICATIONS_PAGE_SIZE
                )
            }

            notifications = response.data
            pagination = response.pagination
        } catch (exception: Exception) {
            error = "Не вдалося завантажити повідомлення"
            exception.printStackTrace()
        } finally {
            loading = false
        }
    }

    LaunchedEffect(page) {
        loadNotifications(page)
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text(
                    text = "Повідомлення",
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.SemiBold
                )

                Text(
                    text = "По 10 повідомлень · усього: ${pagination.total}",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    style = MaterialTheme.typography.bodySmall
                )
            }

            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                TextButton(
                    onClick = {
                        scope.launch {
                            loadNotifications(page)
                        }
                    },
                    enabled = !loading
                ) {
                    Text("Оновити")
                }

                TextButton(onClick = onBack) {
                    Text("Назад")
                }
            }
        }

        if (error.isNotBlank()) {
            Text(
                text = error,
                color = MaterialTheme.colorScheme.error
            )
        }

        if (loading) {
            Column(
                modifier = Modifier.fillMaxSize(),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center
            ) {
                CircularProgressIndicator()
                Spacer(modifier = Modifier.height(8.dp))
                Text("Завантаження...")
            }
        } else if (notifications.isEmpty()) {
            Text("Повідомлень поки немає")
        } else {
            LazyColumn(
                verticalArrangement = Arrangement.spacedBy(10.dp),
                modifier = Modifier.weight(1f)
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

                item {
                    NotificationsPaginationControls(
                        page = pagination.page,
                        totalPages = pagination.totalPages,
                        total = pagination.total,
                        onPrevious = {
                            if (page > 1) {
                                page -= 1
                            }
                        },
                        onNext = {
                            if (page < pagination.totalPages) {
                                page += 1
                            }
                        }
                    )
                }
            }
        }
    }

    selectedNotification?.let { notification ->
        AlertDialog(
            onDismissRequest = {
                selectedNotification = null
                replyText = ""
            },
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
                        onValueChange = { replyText = it },
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
                        onClick = {
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
                                    loadNotifications(page)
                                } catch (exception: Exception) {
                                    error = "Не вдалося відмітити повідомлення"
                                    exception.printStackTrace()
                                } finally {
                                    actionLoading = false
                                }
                            }
                        },
                        enabled = !actionLoading && notification.readAt == null
                    ) {
                        Text("Ознайомився")
                    }

                    Button(
                        onClick = {
                            if (replyText.isBlank()) {
                                error = "Введіть текст відповіді"
                                return@Button
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
                                    loadNotifications(page)
                                } catch (exception: Exception) {
                                    error = "Не вдалося надіслати відповідь"
                                    exception.printStackTrace()
                                } finally {
                                    actionLoading = false
                                }
                            }
                        },
                        enabled = !actionLoading && notification.repliedAt == null
                    ) {
                        Text("Відповісти")
                    }
                }
            },
            dismissButton = {
                TextButton(
                    onClick = {
                        selectedNotification = null
                        replyText = ""
                    }
                ) {
                    Text("Закрити")
                }
            }
        )
    }
}

@Composable
private fun NotificationsPaginationControls(
    page: Int,
    totalPages: Int,
    total: Int,
    onPrevious: () -> Unit,
    onNext: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = MaterialTheme.shapes.large
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            OutlinedButton(
                onClick = onPrevious,
                enabled = page > 1
            ) {
                Text("Назад")
            }

            Text(
                text = "$page / $totalPages · $total",
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.SemiBold
            )

            OutlinedButton(
                onClick = onNext,
                enabled = page < totalPages
            ) {
                Text("Далі")
            }
        }
    }
}

@Composable
fun NotificationListItem(
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

fun getNotificationStatusLabel(notification: MobileNotificationDto): String {
    return when {
        notification.repliedAt != null -> "Відповідь надіслано"
        notification.readAt != null -> "Ознайомлено"
        else -> "Нове повідомлення"
    }
}

fun formatMobileDate(value: String?): String {
    if (value.isNullOrBlank()) {
        return "—"
    }

    return value.replace("T", " ").take(16)
}
