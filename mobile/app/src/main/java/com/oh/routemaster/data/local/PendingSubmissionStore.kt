package com.oh.routemaster.data.local

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import kotlinx.coroutines.flow.firstOrNull
import kotlinx.coroutines.flow.map

private val Context.pendingSubmissionDataStore by preferencesDataStore(name = "route_master_pending_submissions")

const val PENDING_KIND_GBR_SHIFT = "GBR_SHIFT"
const val PENDING_KIND_POST_DUTY = "POST_DUTY"

data class PendingSubmissionItem(
    val id: String,
    val kind: String,
    val title: String,
    val createdAt: Long,
    val bodyJson: String
)

class PendingSubmissionStore(
    private val context: Context
) {
    private object Keys {
        val PENDING_JSON = stringPreferencesKey("pending_submissions_json")
    }

    val pendingJsonFlow = context.pendingSubmissionDataStore.data.map { preferences ->
        preferences[Keys.PENDING_JSON]
    }

    suspend fun getPending(gson: Gson = Gson()): List<PendingSubmissionItem> {
        val json = pendingJsonFlow.firstOrNull()

        if (json.isNullOrBlank()) {
            return emptyList()
        }

        return try {
            val type = object : TypeToken<List<PendingSubmissionItem>>() {}.type
            gson.fromJson<List<PendingSubmissionItem>>(json, type).orEmpty()
        } catch (exception: Exception) {
            exception.printStackTrace()
            emptyList()
        }
    }

    suspend fun savePending(
        items: List<PendingSubmissionItem>,
        gson: Gson = Gson()
    ) {
        context.pendingSubmissionDataStore.edit { preferences ->
            if (items.isEmpty()) {
                preferences.remove(Keys.PENDING_JSON)
            } else {
                preferences[Keys.PENDING_JSON] = gson.toJson(items)
            }
        }
    }

    suspend fun addPending(
        item: PendingSubmissionItem,
        gson: Gson = Gson()
    ) {
        val current = getPending(gson)
        savePending(current + item, gson)
    }

    suspend fun clear() {
        context.pendingSubmissionDataStore.edit { preferences ->
            preferences.remove(Keys.PENDING_JSON)
        }
    }
}
