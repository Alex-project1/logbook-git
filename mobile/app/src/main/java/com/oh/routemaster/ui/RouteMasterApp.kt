package com.oh.routemaster.ui

import android.app.Activity
import android.content.Context
import android.graphics.Color as AndroidColor
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.AddCircle
import androidx.compose.material.icons.rounded.History
import androidx.compose.material.icons.rounded.Home
import androidx.compose.material.icons.rounded.Map
import androidx.compose.material.icons.rounded.Notifications
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.unit.dp
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.oh.routemaster.data.local.TokenStore
import com.oh.routemaster.data.remote.ApiClient
import com.oh.routemaster.data.remote.MobileLoginRequest
import com.oh.routemaster.services.PendingSubmissionWorkScheduler
import com.oh.routemaster.services.registerFcmToken
import com.oh.routemaster.ui.screens.HistoryScreen
import com.oh.routemaster.ui.screens.HomeScreen
import com.oh.routemaster.ui.screens.LoginScreen
import com.oh.routemaster.ui.screens.NewShiftScreen
import com.oh.routemaster.ui.screens.NotificationsScreen
import com.oh.routemaster.ui.screens.ObjectsScreen
import com.oh.routemaster.ui.theme.RouteMasterTheme
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

private const val SETTINGS_NAME = "route_master_settings"
private const val DARK_THEME_KEY = "dark_theme"

@Composable
fun RouteMasterApp() {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val tokenStore = remember { TokenStore(context.applicationContext) }
    val settings = remember {
        context.applicationContext.getSharedPreferences(
            SETTINGS_NAME,
            Context.MODE_PRIVATE
        )
    }

    var darkTheme by remember {
        mutableStateOf(settings.getBoolean(DARK_THEME_KEY, true))
    }

    RouteMasterTheme(darkTheme = darkTheme) {
        ApplySystemBars(darkTheme = darkTheme)

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
                                    darkTheme = darkTheme,
                                    onThemeChange = { enabled ->
                                        darkTheme = enabled
                                        settings.edit()
                                            .putBoolean(DARK_THEME_KEY, enabled)
                                            .apply()
                                    },
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
}

@Composable
private fun RouteMasterBottomBar(
    currentScreen: AppScreen,
    unreadCount: Int,
    onSelectScreen: (AppScreen) -> Unit
) {
    val itemColors = NavigationBarItemDefaults.colors(
        selectedIconColor = MaterialTheme.colorScheme.primary,
        selectedTextColor = MaterialTheme.colorScheme.primary,
        indicatorColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.22f),
        unselectedIconColor = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.78f),
        unselectedTextColor = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.78f)
    )

    NavigationBar(
        containerColor = MaterialTheme.colorScheme.surface,
        tonalElevation = 10.dp
    ) {
        NavigationBarItem(
            selected = currentScreen == AppScreen.HOME,
            onClick = { onSelectScreen(AppScreen.HOME) },
            colors = itemColors,
            icon = { Icon(Icons.Rounded.Home, contentDescription = null) },
            label = { Text("Головна") }
        )

        NavigationBarItem(
            selected = currentScreen == AppScreen.NEW_SHIFT,
            onClick = { onSelectScreen(AppScreen.NEW_SHIFT) },
            colors = itemColors,
            icon = { Icon(Icons.Rounded.AddCircle, contentDescription = null) },
            label = { Text("Зміна") }
        )

        NavigationBarItem(
            selected = currentScreen == AppScreen.OBJECTS,
            onClick = { onSelectScreen(AppScreen.OBJECTS) },
            colors = itemColors,
            icon = { Icon(Icons.Rounded.Map, contentDescription = null) },
            label = { Text("Об’єкти") }
        )

        NavigationBarItem(
            selected = currentScreen == AppScreen.HISTORY,
            onClick = { onSelectScreen(AppScreen.HISTORY) },
            colors = itemColors,
            icon = { Icon(Icons.Rounded.History, contentDescription = null) },
            label = { Text("Історія") }
        )

        NavigationBarItem(
            selected = currentScreen == AppScreen.NOTIFICATIONS,
            onClick = { onSelectScreen(AppScreen.NOTIFICATIONS) },
            colors = itemColors,
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
                    Icon(Icons.Rounded.Notifications, contentDescription = null)
                }
            },
            label = { Text("SMS") }
        )
    }
}

@Composable
private fun ApplySystemBars(darkTheme: Boolean) {
    val view = LocalView.current

    if (view.isInEditMode) {
        return
    }

    SideEffect {
        val window = (view.context as? Activity)?.window ?: return@SideEffect

        WindowCompat.setDecorFitsSystemWindows(window, false)

        window.statusBarColor = AndroidColor.TRANSPARENT
        window.navigationBarColor = AndroidColor.TRANSPARENT

        WindowInsetsControllerCompat(window, view).apply {
            isAppearanceLightStatusBars = !darkTheme
            isAppearanceLightNavigationBars = !darkTheme
        }
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
