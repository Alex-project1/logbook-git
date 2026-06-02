package com.oh.routemaster

import android.os.Build
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.oh.routemaster.data.local.TokenStore
import com.oh.routemaster.data.remote.ApiClient
import com.oh.routemaster.data.remote.DeviceTokenRequest
import kotlinx.coroutines.flow.firstOrNull
import kotlinx.coroutines.runBlocking

class RouteMasterFirebaseMessagingService : FirebaseMessagingService() {
    override fun onNewToken(token: String) {
        super.onNewToken(token)

        runBlocking {
            val tokenStore = TokenStore(applicationContext)
            val accessToken = tokenStore.accessTokenFlow.firstOrNull()

            if (!accessToken.isNullOrBlank()) {
                try {
                    ApiClient.api.registerDeviceToken(
                        authorization = "Bearer $accessToken",
                        body = DeviceTokenRequest(
                            token = token,
                            platform = "android",
                            deviceName = Build.MODEL
                        )
                    )
                } catch (error: Exception) {
                    error.printStackTrace()
                }
            }
        }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)

        val notificationId = message.data["notificationId"]?.toIntOrNull()
            ?: System.currentTimeMillis().toInt()

        val title = message.notification?.title
            ?: "Нове повідомлення"

        val body = message.notification?.body
            ?: "Вам надійшло нове повідомлення"

        NotificationHelper.showNotification(
            context = applicationContext,
            title = title,
            body = body,
            notificationId = notificationId
        )
    }
}