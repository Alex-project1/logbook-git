package com.oh.routemaster.data.local

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.google.gson.Gson
import com.oh.routemaster.data.remote.MobileBootstrapDto
import kotlinx.coroutines.flow.firstOrNull
import kotlinx.coroutines.flow.map

private val Context.mobileBootstrapDataStore by preferencesDataStore(name = "route_master_mobile_bootstrap")

class MobileBootstrapStore(
    private val context: Context
) {
    private object Keys {
        val BOOTSTRAP_JSON = stringPreferencesKey("mobile_bootstrap_json")
        val UPDATED_AT = longPreferencesKey("mobile_bootstrap_updated_at")
    }

    val bootstrapJsonFlow = context.mobileBootstrapDataStore.data.map { preferences ->
        preferences[Keys.BOOTSTRAP_JSON]
    }

    val updatedAtFlow = context.mobileBootstrapDataStore.data.map { preferences ->
        preferences[Keys.UPDATED_AT]
    }

    suspend fun getBootstrap(gson: Gson = Gson()): MobileBootstrapDto? {
        val json = bootstrapJsonFlow.firstOrNull()

        if (json.isNullOrBlank()) {
            return null
        }

        return try {
            gson.fromJson(json, MobileBootstrapDto::class.java)
        } catch (exception: Exception) {
            exception.printStackTrace()
            null
        }
    }

    suspend fun getUpdatedAt(): Long? {
        return updatedAtFlow.firstOrNull()
    }

    suspend fun saveBootstrap(
        bootstrap: MobileBootstrapDto,
        gson: Gson = Gson()
    ) {
        context.mobileBootstrapDataStore.edit { preferences ->
            preferences[Keys.BOOTSTRAP_JSON] = gson.toJson(bootstrap)
            preferences[Keys.UPDATED_AT] = System.currentTimeMillis()
        }
    }

    suspend fun clear() {
        context.mobileBootstrapDataStore.edit { preferences ->
            preferences.remove(Keys.BOOTSTRAP_JSON)
            preferences.remove(Keys.UPDATED_AT)
        }
    }
}
