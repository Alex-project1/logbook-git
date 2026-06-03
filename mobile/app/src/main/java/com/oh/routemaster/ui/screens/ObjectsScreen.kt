package com.oh.routemaster.ui.screens

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
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
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import com.google.gson.Gson
import com.oh.routemaster.data.remote.ApiClient
import com.oh.routemaster.data.remote.MobileMapCenterDto
import com.oh.routemaster.data.remote.MobileObjectDto
import kotlinx.coroutines.CoroutineScope
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

    var center by remember { mutableStateOf(MobileMapCenterDto(lat = 48.4647, lng = 35.0462)) }
    var cityTitle by remember { mutableStateOf("") }
    var totalObjects by remember { mutableStateOf(0) }

    var loading by remember { mutableStateOf(true) }
    var searching by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf("") }
    var status by remember { mutableStateOf("") }
    var query by remember { mutableStateOf("") }

    var webView by remember { mutableStateOf<WebView?>(null) }

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
                        enabled = !loading
                    ) {
                        Text("Оновити")
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
    center: MobileMapCenterDto,
    scope: CoroutineScope,
    onWebViewReady: (WebView) -> Unit,
    onStatus: (String) -> Unit,
    onError: (String) -> Unit
) {
    val context = androidx.compose.ui.platform.LocalContext.current
    var webViewRef: WebView? = null
    val bridge = remember(accessToken) {
        ObjectsMapBridge(
            context = context.applicationContext,
            accessToken = accessToken,
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
                            handleRouteMasterUrl(context, url)
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
                        east = east
                    )
                }

                val json = gson.toJson(response.data)
                val status = "На мапі: ${response.visible} / ${response.total}. Точок: ${response.data.size}"

                mainHandler.post {
                    onStatus(status)
                    getWebView()?.evaluateJavascript(
                        "window.routeMasterSetClusters($json);",
                        null
                    )
                }
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

private fun handleRouteMasterUrl(context: Context, uri: Uri) {
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
            val url = uri.getQueryParameter("url").orEmpty()

            if (url.startsWith("http://") || url.startsWith("https://")) {
                openExternalUrl(context, url)
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
                var account = escapeHtml(object.accountNumber || 'Без номера');
                var title = escapeHtml(object.title || 'Об’єкт');
                var client = escapeHtml(object.clientName || '');
                var address = escapeHtml(object.address || 'Адреса не вказана');
                var cardUrl = object.cardUrl || '';
                var hasCard = String(cardUrl).indexOf('http://') === 0 || String(cardUrl).indexOf('https://') === 0;

                var html = '';
                html += '<div>';
                html += '<div class="popup-title">' + account + ' · ' + title + '</div>';

                if (client) {
                    html += '<div class="popup-text">Клієнт: ' + client + '</div>';
                }

                html += '<div class="popup-text">Адреса: ' + address + '</div>';
                html += '<div class="popup-actions">';

                if (hasCard) {
                    html += '<a href="routemaster://card?url=' + encodeUrl(cardUrl) + '">Картка</a>';
                }

                html += '<a class="secondary" href="routemaster://route?lat=' + object.lat + '&lng=' + object.lng + '">Маршрут</a>';
                html += '</div>';
                html += '</div>';

                return html;
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
                        map.setView([item.lat, item.lng], nextZoom);
                    });

                    markerLayer.addLayer(marker);
                    return;
                }

                var objectMarker = L.marker([item.lat, item.lng]);
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

            window.routeMasterFocusObject = function(object) {
                if (!object || object.lat == null || object.lng == null) return;

                if (searchMarker) {
                    map.removeLayer(searchMarker);
                    searchMarker = null;
                }

                searchMarker = L.marker([object.lat, object.lng], {
                    title: object.accountNumber || object.title || 'Об’єкт'
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
