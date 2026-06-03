package com.oh.routemaster.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import com.oh.routemaster.data.local.TokenStore
import com.oh.routemaster.data.remote.ApiClient
import com.oh.routemaster.data.remote.MobileLoginRequest
import com.oh.routemaster.services.registerFcmToken
import com.oh.routemaster.services.PendingSubmissionWorkScheduler
import com.oh.routemaster.ui.screens.HistoryScreen
import com.oh.routemaster.ui.screens.HomeScreen
import com.oh.routemaster.ui.screens.LoginScreen
import com.oh.routemaster.ui.screens.NewShiftScreen
import com.oh.routemaster.ui.screens.NotificationsScreen
import com.oh.routemaster.ui.screens.ObjectsScreen
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.firstOrNull
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private enum class AppScreen {
    HOME,
    NEW_SHIFT,
    OBJECTS,
    HISTORY,
    NOTIFICATIONS
}

@Composable
fun RouteMasterApp() {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val tokenStore = remember { TokenStore(context.applicationContext) }

    var savedToken by remember { mutableStateOf<String?>(null) }
    var currentScreen by remember { mutableStateOf(AppScreen.HOME) }

    var login by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }

    var unreadCount by remember { mutableStateOf(0) }
    var loading by remember { mutableStateOf(false) }
    var status by remember { mutableStateOf("") }
    var error by remember { mutableStateOf("") }

    LaunchedEffect(Unit) {
        savedToken = tokenStore.accessTokenFlow.firstOrNull()

        if (!savedToken.isNullOrBlank()) {
            PendingSubmissionWorkScheduler.schedulePeriodic(context.applicationContext)
            PendingSubmissionWorkScheduler.enqueueNow(context.applicationContext)

            unreadCount = loadUnreadCount(savedToken.orEmpty())
        }
    }

    Surface(
        modifier = Modifier
            .fillMaxSize()
            .safeDrawingPadding(),
        color = MaterialTheme.colorScheme.background
    ) {
        if (savedToken.isNullOrBlank()) {
            LoginScreen(
                login = login,
                password = password,
                loading = loading,
                status = status,
                error = error,
                onLoginChange = { login = it },
                onPasswordChange = { password = it },
                onSubmit = {
                    if (login.isBlank() || password.isBlank()) {
                        error = "Введіть логін і пароль"
                        return@LoginScreen
                    }

                    scope.launch {
                        loading = true
                        error = ""
                        status = ""

                        try {
                            val response = withContext(Dispatchers.IO) {
                                ApiClient.api.login(
                                    MobileLoginRequest(
                                        login = login.trim(),
                                        password = password
                                    )
                                )
                            }

                            tokenStore.saveAccessToken(response.accessToken)
                            savedToken = response.accessToken
                            status = "Вхід виконано"

                            registerFcmToken(
                                accessToken = response.accessToken,
                                onStatus = { status = it },
                                onError = { error = it }
                            )

                            PendingSubmissionWorkScheduler.schedulePeriodic(context.applicationContext)
                            PendingSubmissionWorkScheduler.enqueueNow(context.applicationContext)

                            unreadCount = loadUnreadCount(response.accessToken)
                        } catch (exception: Exception) {
                            error =
                                "Не вдалося увійти. Перевірте логін, пароль і доступ до сервера."
                            exception.printStackTrace()
                        } finally {
                            loading = false
                        }
                    }
                }
            )
        } else {
            Scaffold(
                bottomBar = {
                    RouteMasterBottomBar(
                        currentScreen = currentScreen,
                        unreadCount = unreadCount,
                        onSelectScreen = { screen ->
                            currentScreen = screen

                            scope.launch {
                                unreadCount = loadUnreadCount(savedToken.orEmpty())
                            }
                        }
                    )
                }
            ) { innerPadding ->
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(innerPadding)
                ) {
                    when (currentScreen) {
                        AppScreen.HOME -> {
                            HomeScreen(
                                status = status.ifBlank { "Вхід виконано" },
                                unreadCount = unreadCount,
                                onLogout = {
                                    scope.launch {
                                        tokenStore.clear()
                                        savedToken = null
                                        currentScreen = AppScreen.HOME
                                        status = ""
                                        error = ""
                                        unreadCount = 0
                                    }
                                },
                                onRegisterFcm = {
                                    registerFcmToken(
                                        accessToken = savedToken.orEmpty(),
                                        onStatus = { status = it },
                                        onError = { error = it }
                                    )
                                },
                                onRefreshUnread = {
                                    scope.launch {
                                        unreadCount = loadUnreadCount(savedToken.orEmpty())
                                    }
                                }
                            )
                        }

                       AppScreen.NEW_SHIFT -> {
    NewShiftScreen(
        accessToken = savedToken.orEmpty()
    )
}

                        AppScreen.OBJECTS -> {
                            ObjectsScreen(
                                accessToken = savedToken.orEmpty()
                            )
                        }

                        AppScreen.HISTORY -> {
                            HistoryScreen(
                                accessToken = savedToken.orEmpty()
                            )
                        }

                        AppScreen.NOTIFICATIONS -> {
                            NotificationsScreen(
                                accessToken = savedToken.orEmpty(),
                                onBack = {
                                    currentScreen = AppScreen.HOME
                                    scope.launch {
                                        unreadCount = loadUnreadCount(savedToken.orEmpty())
                                    }
                                }
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun RouteMasterBottomBar(
    currentScreen: AppScreen,
    unreadCount: Int,
    onSelectScreen: (AppScreen) -> Unit
) {
    NavigationBar {
        NavigationBarItem(
            selected = currentScreen == AppScreen.HOME,
            onClick = { onSelectScreen(AppScreen.HOME) },
            icon = { Text("🏠") },
            label = { Text("Головна") }
        )

        NavigationBarItem(
            selected = currentScreen == AppScreen.NEW_SHIFT,
            onClick = { onSelectScreen(AppScreen.NEW_SHIFT) },
            icon = { Text("➕") },
            label = { Text("Зміна") }
        )

        NavigationBarItem(
            selected = currentScreen == AppScreen.OBJECTS,
            onClick = { onSelectScreen(AppScreen.OBJECTS) },
            icon = { Text("🗺️") },
            label = { Text("Об’єкти") }
        )

        NavigationBarItem(
            selected = currentScreen == AppScreen.HISTORY,
            onClick = { onSelectScreen(AppScreen.HISTORY) },
            icon = { Text("📜") },
            label = { Text("Історія") }
        )

        NavigationBarItem(
            selected = currentScreen == AppScreen.NOTIFICATIONS,
            onClick = { onSelectScreen(AppScreen.NOTIFICATIONS) },
            icon = {
                BadgedBox(
                    badge = {
                        if (unreadCount > 0) {
                            Badge {
                                Text(
                                    if (unreadCount > 99) {
                                        "99+"
                                    } else {
                                        unreadCount.toString()
                                    }
                                )
                            }
                        }
                    }
                ) {
                    Text("🔔")
                }
            },
            label = { Text("SMS") }
        )
    }
}

private suspend fun loadUnreadCount(accessToken: String): Int {
    return try {
        withContext(Dispatchers.IO) {
            ApiClient.api.getUnreadNotificationsCount(
                authorization = "Bearer $accessToken"
            ).data.unreadCount
        }
    } catch (exception: Exception) {
        exception.printStackTrace()
        0
    }
}