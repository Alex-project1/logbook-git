package com.oh.routemaster.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.oh.routemaster.data.remote.BootstrapMobileUserDto

@Composable
fun HomeScreen(
    status: String,
    unreadCount: Int,
    mobileUser: BootstrapMobileUserDto?,
    darkTheme: Boolean,
    onThemeChange: (Boolean) -> Unit,
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
            style = MaterialTheme.typography.headlineMedium,
            color = MaterialTheme.colorScheme.onBackground
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
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.SemiBold
                )

                Text(
                    text = status,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )

                if (mobileUser != null) {
                    UserContextBlock(mobileUser = mobileUser)
                } else {
                    Text(
                        text = "Користувач: завантаження даних...",
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }

                Text(
                    text = "Непрочитаних повідомлень: $unreadCount",
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }

        Spacer(modifier = Modifier.height(14.dp))

        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = MaterialTheme.shapes.large,
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.surfaceVariant
            ),
            border = BorderStroke(
                width = 1.dp,
                color = MaterialTheme.colorScheme.outline
            )
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(18.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    Text(
                        text = if (darkTheme) "🌙 Темна тема" else "☀️ Світла тема",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold
                    )

                    Text(
                        text = if (darkTheme) {
                            "Золотий акцент на темному фоні"
                        } else {
                            "Світла бежево-золота палітра"
                        },
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }

                Switch(
                    checked = darkTheme,
                    onCheckedChange = onThemeChange
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

@Composable
private fun UserContextBlock(
    mobileUser: BootstrapMobileUserDto
) {
    val userKind = mobileUser.userKind.orEmpty()
    val primaryLabel = when (userKind) {
        "CREW" -> "Позивний"
        "POST" -> "Пост"
        else -> "Користувач"
    }

    val primaryValue = when (userKind) {
        "CREW" -> mobileUser.crew?.name
        "POST" -> mobileUser.dutyPost?.name
        else -> null
    }.orEmpty().ifBlank {
        mobileUser.displayName.orEmpty().ifBlank { mobileUser.login }
    }

    Column(
        verticalArrangement = Arrangement.spacedBy(5.dp)
    ) {
        Text(
            text = "$primaryLabel: $primaryValue",
            style = MaterialTheme.typography.bodyLarge,
            fontWeight = FontWeight.SemiBold,
            color = MaterialTheme.colorScheme.onSurface
        )

        Text(
            text = "Підрозділ: ${mobileUser.department?.name ?: "—"}",
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )

        Text(
            text = "Місто: ${mobileUser.city?.name ?: "—"}",
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}
