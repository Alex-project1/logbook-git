package com.oh.routemaster.services

import android.os.Build
import com.google.firebase.messaging.FirebaseMessaging
import com.oh.routemaster.data.remote.ApiClient
import com.oh.routemaster.data.remote.DeviceTokenRequest
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private val fcmCoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

fun registerFcmToken(
    accessToken: String,
    onStatus: (String) -> Unit,
    onError: (String) -> Unit
) {
    FirebaseMessaging.getInstance().token
        .addOnSuccessListener { fcmToken: String ->
            fcmCoroutineScope.launch {
                try {
                    ApiClient.api.registerDeviceToken(
                        authorization = "Bearer $accessToken",
                        body = DeviceTokenRequest(
                            token = fcmToken,
                            platform = "android",
                            deviceName = Build.MODEL
                        )
                    )

                    withContext(Dispatchers.Main) {
                        onStatus("Push-токен зареєстровано")
                    }
                } catch (exception: Exception) {
                    exception.printStackTrace()

                    withContext(Dispatchers.Main) {
                        onError("Вхід виконано, але push-токен не вдалося зареєструвати")
                    }
                }
            }
        }
        .addOnFailureListener { exception: Exception ->
            exception.printStackTrace()
            onError("Не вдалося отримати push-токен")
        }
}
