package com.oh.routemaster.ui.screens

import android.annotation.SuppressLint
import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.content.Intent
import android.location.Location
import android.location.LocationManager
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.webkit.ConsoleMessage
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import com.google.gson.Gson
import com.oh.routemaster.data.remote.ApiClient
import com.oh.routemaster.data.remote.MobileMapCenterDto
import com.oh.routemaster.data.remote.MobileObjectDto
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private const val OBJECTS_MAP_TAG = "RM_OBJECTS_MAP"

@Composable
fun ObjectsScreen(
    accessToken: String
) {
    val scope = rememberCoroutineScope()
    val gson = remember { Gson() }
    val context = LocalContext.current

    var center by remember { mutableStateOf(MobileMapCenterDto(lat = 48.4647, lng = 35.0462)) }
    var cityTitle by remember { mutableStateOf("") }
    var totalObjects by remember { mutableStateOf(0) }
    var gbrCallsigns by remember { mutableStateOf<List<String>>(emptyList()) }
    var selectedGbr by remember { mutableStateOf<String?>(null) }

    var loading by remember { mutableStateOf(true) }
    var searching by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf("") }
    var status by remember { mutableStateOf("") }
    var query by remember { mutableStateOf("") }

    var webView by remember { mutableStateOf<WebView?>(null) }

    fun focusUserLocationOnMap() {
        val location = getBestLastKnownLocation(context)

        if (location == null) {
            error = "Не вдалося визначити місцезнаходження. Увімкніть GPS і відкрийте карти/геолокацію на телефоні."
            return
        }

        status = "Ваше місцезнаходження знайдено"
        error = ""

        val lat = location.latitude
        val lng = location.longitude
        val js = """
            (function() {
                if (window.routeMasterShowMyLocation) {
                    return window.routeMasterShowMyLocation($lat, $lng);
                }
                return false;
            })();
        """.trimIndent()

        val retryJs = """
            setTimeout(function() {
                if (window.routeMasterShowMyLocation) {
                    window.routeMasterShowMyLocation($lat, $lng);
                }
            }, 700);
        """.trimIndent()

        val currentWebView = webView

        if (currentWebView == null) {
            error = "Мапа ще завантажується. Спробуйте натиснути “Знайти мене” ще раз."
        } else {
            currentWebView.evaluateJavascript(js) { result ->
                if (result != "true") {
                    currentWebView.evaluateJavascript(retryJs, null)
                }
            }
        }
    }

    val locationPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        val granted =
            permissions[Manifest.permission.ACCESS_FINE_LOCATION] == true ||
                permissions[Manifest.permission.ACCESS_COARSE_LOCATION] == true

        if (granted) {
            focusUserLocationOnMap()
        } else {
            error = "Дозвольте доступ до геолокації, щоб знайти вас на мапі"
        }
    }

    fun requestFindMe() {
        if (hasLocationPermission(context)) {
            focusUserLocationOnMap()
        } else {
            locationPermissionLauncher.launch(
                arrayOf(
                    Manifest.permission.ACCESS_FINE_LOCATION,
                    Manifest.permission.ACCESS_COARSE_LOCATION
                )
            )
        }
    }

    suspend fun loadOverview() {
        loading = true
        error = ""
        status = ""

        try {
            val response = withContext(Dispatchers.IO) {
                ApiClient.api.getMobileObjectsOverview(
                    authorization = "Bearer $accessToken"
                )
            }

            center = response.center
            cityTitle = response.city.name
            totalObjects = response.total
            gbrCallsigns = response.gbrCallsigns
                .map { it.trim() }
                .filter { it.isNotBlank() }
                .distinct()
                .sortedWith(compareBy(String.CASE_INSENSITIVE_ORDER) { it })
            if (selectedGbr != null && selectedGbr !in response.gbrCallsigns) {
                selectedGbr = null
            }
            status = "Об’єктів у місті: ${response.total}"
        } catch (exception: Exception) {
            error = "Не вдалося завантажити об’єкти: ${exception.message ?: "невідома помилка"}"
            exception.printStackTrace()
        } finally {
            loading = false
        }
    }

    suspend fun searchObject() {
        val accountNumber = query.trim().uppercase().replace("\\s+".toRegex(), "")

        if (accountNumber.isBlank()) {
            error = "Введіть номер об’єкта"
            return
        }

        searching = true
        error = ""
        status = ""

        try {
            val response = withContext(Dispatchers.IO) {
                ApiClient.api.searchMobileObject(
                    authorization = "Bearer $accessToken",
                    accountNumber = accountNumber
                )
            }

            val found = response.data.firstOrNull { it.lat != null && it.lng != null && it.lat != 0.0 && it.lng != 0.0 }

            if (found == null) {
                error = if (response.data.isEmpty()) {
                    "Об’єкт не знайдено"
                } else {
                    "Об’єкт знайдено, але координати відсутні"
                }
                return
            }

            status = "Знайдено: ${found.accountNumber.ifBlank { found.title }}"
            val objectJson = gson.toJson(found)

            webView?.evaluateJavascript(
                "window.routeMasterFocusObject($objectJson);",
                null
            )
        } catch (exception: Exception) {
            error = "Не вдалося знайти об’єкт: ${exception.message ?: "невідома помилка"}"
            exception.printStackTrace()
        } finally {
            searching = false
        }
    }

    LaunchedEffect(Unit) {
        loadOverview()
    }

    LaunchedEffect(selectedGbr) {
        webView?.evaluateJavascript(
            "if (window.routeMasterForceReloadClusters) window.routeMasterForceReloadClusters();",
            null
        )
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Text(
            text = "Об’єкти",
            style = MaterialTheme.typography.headlineSmall
        )

        if (cityTitle.isNotBlank()) {
            Text(
                text = "Місто: $cityTitle",
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }

        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.surface
            )
        ) {
            Column(
                modifier = Modifier.padding(12.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                OutlinedTextField(
                    value = query,
                    onValueChange = { query = it },
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("Пошук за номером об’єкта") },
                    placeholder = { Text("Наприклад: ZP1067") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(
                        capitalization = KeyboardCapitalization.Characters,
                        keyboardType = KeyboardType.Text
                    )
                )

                Column(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Button(
                            onClick = {
                                scope.launch {
                                    searchObject()
                                }
                            },
                            enabled = !searching,
                            modifier = Modifier.weight(1f)
                        ) {
                            Text(if (searching) "Пошук..." else "Знайти")
                        }

                        Button(
                            onClick = { requestFindMe() },
                            modifier = Modifier.weight(1f)
                        ) {
                            Text("Знайти мене")
                        }
                    }

                    TextButton(
                        onClick = {
                            scope.launch {
                                loadOverview()
                                webView?.evaluateJavascript(
                                    "if (window.routeMasterForceReloadClusters) window.routeMasterForceReloadClusters();",
                                    null
                                )
                            }
                        },
                        enabled = !loading,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text("Оновити")
                    }
                }

                if (gbrCallsigns.isNotEmpty()) {
                    Text(
                        text = "Фільтр за позивним",
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )

                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        if (selectedGbr == null) {
                            Button(onClick = { selectedGbr = null }) {
                                Text("Усі")
                            }
                        } else {
                            TextButton(onClick = { selectedGbr = null }) {
                                Text("Усі")
                            }
                        }

                        gbrCallsigns.forEach { callsign ->
                            if (selectedGbr == callsign) {
                                Button(onClick = { selectedGbr = callsign }) {
                                    Text(callsign)
                                }
                            } else {
                                TextButton(onClick = { selectedGbr = callsign }) {
                                    Text(callsign)
                                }
                            }
                        }
                    }
                }

                if (status.isNotBlank()) {
                    Text(
                        text = status,
                        color = MaterialTheme.colorScheme.primary
                    )
                }

                if (error.isNotBlank()) {
                    Text(
                        text = error,
                        color = MaterialTheme.colorScheme.error
                    )
                }
            }
        }

        Box(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f)
                .heightIn(min = 360.dp),
            contentAlignment = Alignment.Center
        ) {
            when {
                loading -> {
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        CircularProgressIndicator()
                        Text("Завантаження об’єктів...")
                    }
                }

                error.isNotBlank() && totalObjects == 0 -> {
                    Text(
                        text = error,
                        color = MaterialTheme.colorScheme.error
                    )
                }

                else -> {
                    ObjectsMapWebView(
                        accessToken = accessToken,
                        totalObjects = totalObjects,
                        selectedGbr = selectedGbr,
                        center = center,
                        scope = scope,
                        onWebViewReady = { webView = it },
                        onStatus = { status = it },
                        onError = { error = it }
                    )
                }
            }
        }
    }
}

@SuppressLint("SetJavaScriptEnabled", "JavascriptInterface")
@Composable
private fun ObjectsMapWebView(
    accessToken: String,
    totalObjects: Int,
    selectedGbr: String?,
    center: MobileMapCenterDto,
    scope: CoroutineScope,
    onWebViewReady: (WebView) -> Unit,
    onStatus: (String) -> Unit,
    onError: (String) -> Unit
) {
    val context = androidx.compose.ui.platform.LocalContext.current
    val selectedGbrState = rememberUpdatedState(selectedGbr)
    var webViewRef: WebView? = null
    val bridge = remember(accessToken) {
        ObjectsMapBridge(
            context = context.applicationContext,
            accessToken = accessToken,
            getSelectedGbr = { selectedGbrState.value },
            scope = scope,
            getWebView = { webViewRef },
            onStatus = onStatus,
            onError = onError
        )
    }
    val html = remember(center, totalObjects) {
        buildObjectsMapHtml(
            center = center,
            totalObjects = totalObjects
        )
    }

    AndroidView(
        modifier = Modifier.fillMaxSize(),
        factory = {
            WebView(it).apply {
                webViewRef = this
                onWebViewReady(this)
                setBackgroundColor(android.graphics.Color.TRANSPARENT)

                // На некоторых телефонах WebView + много графики падает через Vulkan/GPU.
                // Software layer надежнее для рабочей карты с кластерами.
                setLayerType(android.view.View.LAYER_TYPE_SOFTWARE, null)

                webViewClient = object : WebViewClient() {
                    override fun shouldOverrideUrlLoading(
                        view: WebView?,
                        request: WebResourceRequest?
                    ): Boolean {
                        val url = request?.url ?: return false

                        if (url.scheme == "routemaster") {
                            handleRouteMasterUrl(context, url, accessToken, scope, onError)
                            return true
                        }

                        if ((url.scheme == "http" || url.scheme == "https") &&
                            url.host != "127.0.0.1" &&
                            url.host != "localhost"
                        ) {
                            openExternalUrl(context, url.toString())
                            return true
                        }

                        return false
                    }

                    override fun onReceivedError(
                        view: WebView?,
                        request: WebResourceRequest?,
                        error: WebResourceError?
                    ) {
                        Log.e(
                            OBJECTS_MAP_TAG,
                            "WebView error url=${request?.url} description=${error?.description}"
                        )
                    }

                    override fun onPageFinished(view: WebView?, url: String?) {
                        super.onPageFinished(view, url)
                        Log.d(OBJECTS_MAP_TAG, "Page finished: $url")
                        view?.evaluateJavascript(
                            "setTimeout(function(){ if (window.routeMasterMapReady) window.routeMasterMapReady(); }, 250);",
                            null
                        )
                    }
                }

                webChromeClient = object : WebChromeClient() {
                    override fun onConsoleMessage(consoleMessage: ConsoleMessage): Boolean {
                        Log.d(
                            OBJECTS_MAP_TAG,
                            "${consoleMessage.messageLevel()}: ${consoleMessage.message()} (${consoleMessage.lineNumber()})"
                        )
                        return true
                    }
                }

                settings.javaScriptEnabled = true
                settings.domStorageEnabled = true
                settings.loadWithOverviewMode = true
                settings.useWideViewPort = true
                settings.cacheMode = WebSettings.LOAD_NO_CACHE
                settings.mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
                settings.allowContentAccess = true
                settings.allowFileAccess = true

                addJavascriptInterface(bridge, "RouteMasterBridge")

                loadDataWithBaseURL(
                    "http://127.0.0.1:5000/",
                    html,
                    "text/html",
                    "UTF-8",
                    null
                )
            }
        },
        update = { view ->
            webViewRef = view
            onWebViewReady(view)
        }
    )
}

private class ObjectsMapBridge(
    private val context: Context,
    private val accessToken: String,
    private val getSelectedGbr: () -> String?,
    private val scope: CoroutineScope,
    private val getWebView: () -> WebView?,
    private val onStatus: (String) -> Unit,
    private val onError: (String) -> Unit
) {
    private val mainHandler = Handler(Looper.getMainLooper())
    private val gson = Gson()
    private var clusterJob: Job? = null

    @android.webkit.JavascriptInterface
    fun pingFromJs(): String = "ok"

    @android.webkit.JavascriptInterface
    fun requestClusters(
        zoom: Int,
        south: Double,
        west: Double,
        north: Double,
        east: Double
    ) {
        clusterJob?.cancel()
        clusterJob = scope.launch {
            delay(180)

            try {
                val response = withContext(Dispatchers.IO) {
                    ApiClient.api.getMobileObjectClusters(
                        authorization = "Bearer $accessToken",
                        zoom = zoom,
                        south = south,
                        west = west,
                        north = north,
                        east = east,
                        gbr = getSelectedGbr()
                    )
                }

                val json = gson.toJson(response.data)
                val filterLabel = getSelectedGbr()?.let { " · $it" } ?: ""
                val status = "На мапі$filterLabel: ${response.visible} / ${response.total}. Точок: ${response.data.size}"

                mainHandler.post {
                    onStatus(status)
                    getWebView()?.evaluateJavascript(
                        "window.routeMasterSetClusters($json);",
                        null
                    )
                }
            } catch (exception: CancellationException) {
                // Це нормальна ситуація: користувач рухає мапу, старий запит кластерів скасовується.
            } catch (exception: Exception) {
                exception.printStackTrace()
                mainHandler.post {
                    onError("Не вдалося завантажити точки: ${exception.message ?: "невідома помилка"}")
                    getWebView()?.evaluateJavascript(
                        "window.routeMasterSetMapError(${gson.toJson(exception.message ?: "Помилка завантаження точок")});",
                        null
                    )
                }
            }
        }
    }
}

private fun handleRouteMasterUrl(
    context: Context,
    uri: Uri,
    accessToken: String,
    scope: CoroutineScope,
    onError: (String) -> Unit
) {
    when (uri.host) {
        "route" -> {
            val lat = uri.getQueryParameter("lat")
            val lng = uri.getQueryParameter("lng")

            if (!lat.isNullOrBlank() && !lng.isNullOrBlank()) {
                openExternalUrl(
                    context,
                    "https://www.google.com/maps/dir/?api=1&destination=$lat,$lng"
                )
            }
        }

        "card" -> {
            val directUrl = uri.getQueryParameter("url").orEmpty()
            val accountNumber = uri.getQueryParameter("account").orEmpty()

            if (directUrl.startsWith("http://") || directUrl.startsWith("https://")) {
                openExternalUrl(context, directUrl)
                return
            }

            if (accountNumber.isBlank()) {
                onError("Картка для цього об’єкта відсутня")
                return
            }

            scope.launch {
                try {
                    val response = withContext(Dispatchers.IO) {
                        ApiClient.api.searchMobileObject(
                            authorization = "Bearer $accessToken",
                            accountNumber = accountNumber
                        )
                    }

                    val cardUrl = response.data
                        .firstOrNull { it.cardUrl?.startsWith("http") == true }
                        ?.cardUrl

                    if (cardUrl.isNullOrBlank()) {
                        onError("Картка для об’єкта $accountNumber відсутня")
                    } else {
                        openExternalUrl(context, cardUrl)
                    }
                } catch (exception: CancellationException) {
                    // Ignore.
                } catch (exception: Exception) {
                    exception.printStackTrace()
                    onError("Не вдалося відкрити картку: ${exception.message ?: "невідома помилка"}")
                }
            }
        }
    }
}

private fun openExternalUrl(context: Context, url: String) {
    try {
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
    } catch (exception: Exception) {
        exception.printStackTrace()
    }
}


private fun hasLocationPermission(context: Context): Boolean {
    return ContextCompat.checkSelfPermission(
        context,
        Manifest.permission.ACCESS_FINE_LOCATION
    ) == PackageManager.PERMISSION_GRANTED ||
        ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.ACCESS_COARSE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED
}

@SuppressLint("MissingPermission")
private fun getBestLastKnownLocation(context: Context): Location? {
    if (!hasLocationPermission(context)) {
        return null
    }

    val locationManager = context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager
        ?: return null

    val providers = listOf(
        LocationManager.GPS_PROVIDER,
        LocationManager.NETWORK_PROVIDER,
        LocationManager.PASSIVE_PROVIDER
    )

    return providers
        .mapNotNull { provider ->
            runCatching {
                if (locationManager.isProviderEnabled(provider)) {
                    locationManager.getLastKnownLocation(provider)
                } else {
                    null
                }
            }.getOrNull()
        }
        .maxByOrNull { it.time }
}

private fun buildObjectsMapHtml(
    center: MobileMapCenterDto,
    totalObjects: Int
): String {
    val gson = Gson()
    val centerJson = gson.toJson(center)

    return """
<!doctype html>
<html>
<head>
    <meta charset="utf-8" />
    <meta
        name="viewport"
        content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"
    />
    <link rel="stylesheet" href="api/mobile/objects/map-assets/leaflet.css" />
    <style>
        html, body {
            width: 100vw;
            height: 100vh;
            margin: 0;
            padding: 0;
            overflow: hidden;
            background: #0b1220;
            color: #e5e7eb;
            font-family: Arial, sans-serif;
        }

        #map {
            position: fixed;
            inset: 0;
            width: 100vw;
            height: 100vh;
            min-height: 360px;
            background: #111827;
        }

        #loader {
            position: fixed;
            inset: 0;
            z-index: 9999;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #0b1220;
            color: #e5e7eb;
            font-size: 16px;
            text-align: center;
            padding: 24px;
        }

        #loader.hidden {
            display: none;
        }

        .leaflet-container {
            background: #111827;
        }

        .leaflet-popup-content-wrapper,
        .leaflet-popup-tip {
            background: #111827;
            color: #e5e7eb;
        }

        .popup-title {
            font-weight: 700;
            font-size: 15px;
            margin-bottom: 6px;
        }

        .popup-text {
            font-size: 13px;
            line-height: 1.35;
            margin-bottom: 4px;
        }

        .popup-actions {
            display: flex;
            gap: 8px;
            margin-top: 10px;
        }

        .popup-actions a {
            display: inline-block;
            border: 0;
            border-radius: 8px;
            padding: 8px 10px;
            color: white;
            font-weight: 700;
            text-decoration: none;
            background: #2563eb;
        }

        .popup-actions a.secondary {
            background: #374151;
        }

        .cluster-icon {
            background: rgba(56, 189, 248, 0.95);
            color: #031525;
            border: 3px solid rgba(255, 255, 255, 0.86);
            border-radius: 999px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 800;
            box-shadow: 0 8px 20px rgba(0, 0, 0, 0.35);
        }

        .object-icon {
            width: 22px;
            height: 22px;
            border-radius: 999px;
            background: #fbbf24;
            border: 3px solid #ffffff;
            box-shadow: 0 6px 16px rgba(0, 0, 0, 0.4);
        }

        .object-icon.search {
            background: #22c55e;
        }

        .object-icon.me {
            position: relative;
            background: #38bdf8;
            width: 26px;
            height: 26px;
            border: 4px solid #ffffff;
            box-shadow: 0 0 0 8px rgba(56, 189, 248, 0.25), 0 0 24px rgba(56, 189, 248, 0.75), 0 8px 20px rgba(0, 0, 0, 0.45);
        }

        .object-icon.me::after {
            content: '';
            position: absolute;
            left: 50%;
            top: 50%;
            width: 48px;
            height: 48px;
            transform: translate(-50%, -50%);
            border-radius: 999px;
            border: 2px solid rgba(125, 211, 252, 0.85);
            box-sizing: border-box;
        }

        .popup-actions span.disabled {
            display: inline-block;
            border-radius: 8px;
            padding: 8px 10px;
            color: #9ca3af;
            font-weight: 700;
            background: #1f2937;
        }

        .group-list {
            display: flex;
            flex-direction: column;
            gap: 10px;
            max-height: 260px;
            overflow-y: auto;
        }

        .group-item {
            border-top: 1px solid rgba(255, 255, 255, 0.12);
            padding-top: 8px;
        }
    </style>
</head>
<body>
    <div id="map"></div>
    <div id="loader">Завантаження мапи...</div>

    <script src="api/mobile/objects/map-assets/leaflet.js"></script>

    <script>
        function log(message) {
            console.log('[RouteMasterMap] ' + message);
        }

        function showError(message) {
            var loader = document.getElementById('loader');
            loader.classList.remove('hidden');
            loader.innerHTML = message;
            console.error('[RouteMasterMap] ' + message);
        }

        function hideLoader() {
            document.getElementById('loader').classList.add('hidden');
        }

        try {
            if (typeof L === 'undefined') {
                showError('Leaflet не завантажився');
                throw new Error('Leaflet is not loaded');
            }

            var cityCenter = $centerJson;
            var totalObjects = $totalObjects;
            var markerLayer = L.layerGroup();
            var searchMarker = null;
            var myLocationMarker = null;
            var lastRequestKey = '';

            log('overview total=' + totalObjects);

            var map = L.map('map', {
                zoomControl: true,
                preferCanvas: false
            }).setView([cityCenter.lat, cityCenter.lng], 12);

            L.tileLayer('api/mobile/objects/tile/{z}/{x}/{y}.png', {
                maxZoom: 19,
                minZoom: 1,
                attribution: ''
            }).addTo(map);

            markerLayer.addTo(map);

            function escapeHtml(value) {
                return String(value || '')
                    .split('&').join('&amp;')
                    .split('<').join('&lt;')
                    .split('>').join('&gt;')
                    .split('"').join('&quot;')
                    .split("'").join('&#039;');
            }

            function encodeUrl(value) {
                return encodeURIComponent(String(value || ''));
            }

            function buildPopup(object) {
                var accountRaw = object.accountNumber || '';
                var account = escapeHtml(accountRaw || 'Без номера');
                var title = escapeHtml(object.title || 'Об’єкт');
                var client = escapeHtml(object.clientName || '');
                var address = escapeHtml(object.address || 'Адреса не вказана');
                var cardUrl = object.cardUrl || '';
                var hasAccount = String(accountRaw).length > 0;
                var hasCard = String(cardUrl).indexOf('http://') === 0 || String(cardUrl).indexOf('https://') === 0;

                var html = '';
                html += '<div>';
                html += '<div class="popup-title">' + account + ' · ' + title + '</div>';

                if (client) {
                    html += '<div class="popup-text">Клієнт: ' + client + '</div>';
                }

                html += '<div class="popup-text">Адреса: ' + address + '</div>';

                if (object.gbr) {
                    html += '<div class="popup-text">Позивний: ' + escapeHtml(object.gbr) + '</div>';
                }

                if (object.gbrReserve) {
                    html += '<div class="popup-text">Резерв: ' + escapeHtml(object.gbrReserve) + '</div>';
                }

                html += '<div class="popup-actions">';

                if (hasCard || hasAccount) {
                    html += '<a href="routemaster://card?account=' + encodeUrl(accountRaw) + '&url=' + encodeUrl(cardUrl) + '">Картка</a>';
                } else {
                    html += '<span class="disabled">Картка відсутня</span>';
                }

                html += '<a class="secondary" href="routemaster://route?lat=' + object.lat + '&lng=' + object.lng + '">Маршрут</a>';
                html += '</div>';
                html += '</div>';

                return html;
            }

            function buildGroupPopup(item) {
                var html = '';
                html += '<div>';
                html += '<div class="popup-title">Об’єкти за цією адресою: ' + item.count + '</div>';
                html += '<div class="group-list">';

                var list = Array.isArray(item.objects) ? item.objects : [];

                for (var i = 0; i < list.length; i++) {
                    html += '<div class="group-item">';
                    html += buildPopup(list[i]);
                    html += '</div>';
                }

                html += '</div>';
                html += '</div>';
                return html;
            }

            function createObjectIcon(kind) {
                var className = 'object-icon';

                if (kind === 'search') {
                    className += ' search';
                }

                if (kind === 'me') {
                    className += ' me';
                }

                return L.divIcon({
                    html: '<div class="' + className + '"></div>',
                    className: '',
                    iconSize: [28, 28],
                    iconAnchor: [14, 14],
                    popupAnchor: [0, -12]
                });
            }

            function createClusterIcon(count) {
                var size = count < 10 ? 34 : count < 100 ? 42 : count < 1000 ? 50 : 58;
                return L.divIcon({
                    html: '<div class="cluster-icon" style="width:' + size + 'px;height:' + size + 'px;">' + count + '</div>',
                    className: '',
                    iconSize: [size, size],
                    iconAnchor: [size / 2, size / 2]
                });
            }

            function addCluster(item) {
                if (item.type === 'cluster') {
                    var marker = L.marker([item.lat, item.lng], {
                        icon: createClusterIcon(item.count)
                    });

                    marker.on('click', function() {
                        var nextZoom = Math.min(map.getZoom() + 2, 18);

                        if (nextZoom === map.getZoom()) {
                            marker.bindPopup('Наблизьте мапу або скористайтесь пошуком об’єкта').openPopup();
                        } else {
                            map.setView([item.lat, item.lng], nextZoom);
                        }
                    });

                    markerLayer.addLayer(marker);
                    return;
                }

                if (item.type === 'group') {
                    var groupMarker = L.marker([item.lat, item.lng], {
                        icon: createClusterIcon(item.count)
                    });

                    groupMarker.bindPopup(buildGroupPopup(item), {
                        maxWidth: 320
                    });

                    markerLayer.addLayer(groupMarker);
                    return;
                }

                var objectMarker = L.marker([item.lat, item.lng], {
                    icon: createObjectIcon('object')
                });
                objectMarker.bindPopup(buildPopup(item));
                markerLayer.addLayer(objectMarker);
            }

            window.routeMasterSetClusters = function(items) {
                markerLayer.clearLayers();

                if (!Array.isArray(items)) {
                    showError('Некоректні точки мапи');
                    return;
                }

                for (var i = 0; i < items.length; i++) {
                    addCluster(items[i]);
                }

                hideLoader();
                log('rendered markers=' + items.length);
            };

            window.routeMasterSetMapError = function(message) {
                showError(message || 'Помилка завантаження точок');
            };

            function requestClusters() {
                var bounds = map.getBounds();
                var zoom = map.getZoom();
                var south = bounds.getSouth();
                var west = bounds.getWest();
                var north = bounds.getNorth();
                var east = bounds.getEast();
                var key = zoom + ':' + south.toFixed(4) + ':' + west.toFixed(4) + ':' + north.toFixed(4) + ':' + east.toFixed(4);

                if (key === lastRequestKey) {
                    return;
                }

                lastRequestKey = key;
                RouteMasterBridge.requestClusters(zoom, south, west, north, east);
            }

            window.routeMasterMapReady = function() {
                setTimeout(function() {
                    map.invalidateSize(true);
                    requestClusters();
                }, 250);
            };

            window.routeMasterForceReloadClusters = function() {
                lastRequestKey = '';
                requestClusters();
            };

            window.routeMasterShowMyLocation = function(lat, lng) {
                if (lat == null || lng == null) {
                    log('my location skipped: empty coordinates');
                    return false;
                }

                var latNumber = Number(lat);
                var lngNumber = Number(lng);

                if (!isFinite(latNumber) || !isFinite(lngNumber)) {
                    log('my location skipped: bad coordinates');
                    return false;
                }

                if (myLocationMarker) {
                    myLocationMarker.setLatLng([latNumber, lngNumber]);
                } else {
                    myLocationMarker = L.marker([latNumber, lngNumber], {
                        title: 'Моє місцезнаходження',
                        icon: createObjectIcon('me'),
                        zIndexOffset: 10000
                    }).addTo(map);
                }

                myLocationMarker
                    .bindPopup(
                        '<div>' +
                        '<div class="popup-title">Ви тут</div>' +
                        '<div class="popup-text">Поточне місцезнаходження телефону</div>' +
                        '</div>'
                    )
                    .openPopup();

                var targetZoom = Math.max(map.getZoom(), 16);
                map.invalidateSize(true);
                map.setView([latNumber, lngNumber], targetZoom, { animate: true });

                setTimeout(function() {
                    map.invalidateSize(true);
                    map.panTo([latNumber, lngNumber], { animate: true });
                    if (myLocationMarker) {
                        myLocationMarker.openPopup();
                    }
                }, 350);

                hideLoader();
                log('my location focused: ' + latNumber + ',' + lngNumber);
                return true;
            };

            window.routeMasterFocusObject = function(object) {
                if (!object || object.lat == null || object.lng == null) return;

                if (searchMarker) {
                    map.removeLayer(searchMarker);
                    searchMarker = null;
                }

                searchMarker = L.marker([object.lat, object.lng], {
                    title: object.accountNumber || object.title || 'Об’єкт',
                    icon: createObjectIcon('search')
                }).addTo(map);

                searchMarker.bindPopup(buildPopup(object)).openPopup();
                map.setView([object.lat, object.lng], 17);
                hideLoader();
            };

            map.on('moveend zoomend', function() {
                requestClusters();
            });
        } catch (error) {
            showError('Помилка мапи: ' + error.message);
        }
    </script>
</body>
</html>
""".trimIndent()
}
