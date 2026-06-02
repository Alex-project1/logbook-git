package com.oh.routemaster.data.local

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.map

private val Context.shiftDraftDataStore by preferencesDataStore(name = "route_master_shift_draft")

class ShiftDraftStore(
    private val context: Context
) {
    private object Keys {
        val SHIFT_DRAFT_JSON = stringPreferencesKey("shift_draft_json")
    }

    val draftFlow = context.shiftDraftDataStore.data.map { preferences ->
        preferences[Keys.SHIFT_DRAFT_JSON]
    }

    suspend fun saveDraft(json: String) {
        context.shiftDraftDataStore.edit { preferences ->
            preferences[Keys.SHIFT_DRAFT_JSON] = json
        }
    }

    suspend fun clearDraft() {
        context.shiftDraftDataStore.edit { preferences ->
            preferences.remove(Keys.SHIFT_DRAFT_JSON)
        }
    }
}
