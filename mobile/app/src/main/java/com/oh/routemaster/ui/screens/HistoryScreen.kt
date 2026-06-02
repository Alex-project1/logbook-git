package com.oh.routemaster.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
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
import com.oh.routemaster.data.remote.MobileHistoryItemDto
import com.oh.routemaster.data.remote.MobileHistoryPostDutyDto
import com.oh.routemaster.data.remote.MobileHistoryShiftDto
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import retrofit2.HttpException
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

@Composable
fun HistoryScreen(
    accessToken: String
) {
    val scope = rememberCoroutineScope()

    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf("") }
    var items by remember { mutableStateOf<List<MobileHistoryItemDto>>(emptyList()) }
    var openedItemKey by remember { mutableStateOf<String?>(null) }

    suspend fun loadHistory() {
        loading = true
        error = ""

        try {
            val response = withContext(Dispatchers.IO) {
                ApiClient.api.getMobileHistory(
                    authorization = "Bearer $accessToken"
                )
            }

            items = response.data
        } catch (exception: Exception) {
            error = "Не вдалося завантажити історію: ${getHistoryApiErrorMessage(exception)}"
            exception.printStackTrace()
        } finally {
            loading = false
        }
    }

    LaunchedEffect(Unit) {
        loadHistory()
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = "Історія",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.SemiBold
            )

            Button(
                onClick = {
                    scope.launch {
                        loadHistory()
                    }
                },
                enabled = !loading
            ) {
                Text("Оновити")
            }
        }

        when {
            loading -> {
                HistoryLoadingCard()
            }

            error.isNotBlank() -> {
                HistoryErrorCard(
                    message = error,
                    onRetry = {
                        scope.launch {
                            loadHistory()
                        }
                    }
                )
            }

            items.isEmpty() -> {
                HistoryEmptyCard()
            }

            else -> {
                items.forEach { item ->
                    val itemKey = "${item.type}-${item.id}"
                    val open = openedItemKey == itemKey

                    HistoryItemCard(
                        item = item,
                        open = open,
                        onToggle = {
                            openedItemKey = if (open) null else itemKey
                        }
                    )
                }
            }
        }
    }
}

@Composable
private fun HistoryItemCard(
    item: MobileHistoryItemDto,
    open: Boolean,
    onToggle: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onToggle() },
        shape = MaterialTheme.shapes.large,
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface
        ),
        border = BorderStroke(
            width = 1.dp,
            color = if (open) {
                MaterialTheme.colorScheme.primary
            } else {
                MaterialTheme.colorScheme.outline
            }
        )
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
                    text = "${formatHistoryDate(item.date)} · ${item.title}",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold
                )

                Text(
                    text = if (open) "▲" else "▼",
                    color = MaterialTheme.colorScheme.primary
                )
            }

            if (!open) {
                if (item.type == "SHIFT" && item.shift != null) {
                    val shift = item.shift
                    Text(
                        text = "Наряд ГБР · 🚓 ${shift.vehicle.licensePlate.orEmpty().ifBlank { shift.vehicle.title }} · 📊 ${shift.summary.totalAlarms}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }

                if (item.type == "POST_DUTY" && item.postDuty != null) {
                    val duty = item.postDuty
                    Text(
                        text = "Пост · ⏱ ${formatNumber(duty.durationHours)} год · 👥 ${duty.members.size}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }

            if (open) {
                if (item.type == "SHIFT" && item.shift != null) {
                    ShiftHistoryDetails(item.shift)
                }

                if (item.type == "POST_DUTY" && item.postDuty != null) {
                    PostDutyHistoryDetails(item.postDuty)
                }
            }
        }
    }
}

@Composable
private fun ShiftHistoryDetails(
    shift: MobileHistoryShiftDto
) {
    Column(
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Text(
            text = "Наряд ГБР",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold
        )
        Text("📅 ${formatHistoryDate(shift.date)} · ${shift.crew.name}")
        Text("🚓 ${shift.vehicle.licensePlate.orEmpty().ifBlank { shift.vehicle.title }}")
        Text("🏁 Пробіг: ${formatNumber(shift.totalDistanceKm)} км")
        Text("👨‍✈️ Старший: ${shift.senior.employee.fullName} ${weaponIcon(shift.senior.hasWeapon)}")
        Text("👮 Водій: ${shift.driver.employee.fullName} ${weaponIcon(shift.driver.hasWeapon)}")

        Text("")
        Text("📊 Усього спрацювань: ${shift.summary.totalAlarms} (${shift.summary.totalOh} / ${shift.summary.totalPartner})")
        Text("    🔥 Бойових: ${shift.summary.combatTotal} (${shift.summary.combatOh} / ${shift.summary.combatPartner})")
        Text("    ➕ Додатково: ${shift.summary.additionalTotal} (${shift.summary.additionalOh} / ${shift.summary.additionalPartner})")

        if (shift.summary.additionalReasons.isEmpty()) {
            Text("        • Немає додаткових причин")
        } else {
            shift.summary.additionalReasons.forEach { reason ->
                Text("        • ${reason.label}: ${reason.total} (${reason.oh} / ${reason.partner})")
            }
        }

        Text("    🔗 Затримано: ${shift.summary.detained}")
        Text("    ➡️ Передано: ${shift.summary.transferred}")
    }
}

@Composable
private fun PostDutyHistoryDetails(
    duty: MobileHistoryPostDutyDto
) {
    Column(
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Text(
            text = "Пост",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold
        )
        Text("📅 ${formatHistoryDate(duty.date)} · ${duty.post.name}")
        Text("⏱ ${formatNumber(duty.durationHours)} год · ${formatNumber(duty.shiftEquivalent)} зміни")
        Text("🚓 ${duty.vehicle?.licensePlate?.ifBlank { duty.vehicle.title } ?: "Без авто"}")

        if (!duty.note.isNullOrBlank()) {
            Text("📝 ${duty.note}")
        }

        duty.members.forEach { member ->
            val icon = if (member.isDriver) "👨‍✈️" else "👮"
            Text("$icon ${member.employee.fullName} ${weaponIcon(member.hasWeapon)}")
        }
    }
}

@Composable
private fun HistoryLoadingCard() {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = MaterialTheme.shapes.large
    ) {
        Row(
            modifier = Modifier.padding(18.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            CircularProgressIndicator()
            Text("Завантаження історії...")
        }
    }
}

@Composable
private fun HistoryErrorCard(
    message: String,
    onRetry: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = MaterialTheme.shapes.large
    ) {
        Column(
            modifier = Modifier.padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Text(
                text = message,
                color = MaterialTheme.colorScheme.error
            )

            Button(onClick = onRetry) {
                Text("Спробувати ще раз")
            }
        }
    }
}

@Composable
private fun HistoryEmptyCard() {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = MaterialTheme.shapes.large
    ) {
        Text(
            text = "Історія поки порожня",
            modifier = Modifier.padding(18.dp),
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

private fun weaponIcon(hasWeapon: Boolean): String {
    return if (hasWeapon) "✅" else "🚫"
}

private fun formatHistoryDate(value: String): String {
    val patterns = listOf(
        "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
        "yyyy-MM-dd'T'HH:mm:ss'Z'",
        "yyyy-MM-dd'T'HH:mm:ss.SSSXXX",
        "yyyy-MM-dd'T'HH:mm:ssXXX"
    )

    for (pattern in patterns) {
        try {
            val parser = SimpleDateFormat(pattern, Locale.getDefault())

            if (pattern.endsWith("'Z'")) {
                parser.timeZone = TimeZone.getTimeZone("UTC")
            }

            val date = parser.parse(value) ?: continue
            return SimpleDateFormat("dd.MM.yyyy", Locale.getDefault()).format(date)
        } catch (_: Exception) {
            // Try next format.
        }
    }

    return value.take(10)
}

private fun formatNumber(value: Double): String {
    return if (value % 1.0 == 0.0) {
        value.toInt().toString()
    } else {
        String.format(Locale.getDefault(), "%.2f", value)
    }
}

private fun getHistoryApiErrorMessage(exception: Exception): String {
    if (exception is HttpException) {
        val errorBody = exception.response()?.errorBody()?.string()

        if (!errorBody.isNullOrBlank()) {
            return errorBody
        }

        return "HTTP ${exception.code()}"
    }

    return exception.message ?: "Невідома помилка"
}
