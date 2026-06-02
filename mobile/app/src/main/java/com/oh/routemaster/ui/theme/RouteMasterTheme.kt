package com.oh.routemaster.ui.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

private val RouteMasterDarkColorScheme: ColorScheme = darkColorScheme(
    primary = Color(0xFF38BDF8),
    onPrimary = Color(0xFF082F49),

    secondary = Color(0xFFA78BFA),
    onSecondary = Color(0xFF2E1065),

    tertiary = Color(0xFF34D399),
    onTertiary = Color(0xFF052E16),

    background = Color(0xFF020617),
    onBackground = Color(0xFFE5E7EB),

    surface = Color(0xFF0F172A),
    onSurface = Color(0xFFE5E7EB),

    surfaceVariant = Color(0xFF1E293B),
    onSurfaceVariant = Color(0xFFCBD5E1),

    error = Color(0xFFF87171),
    onError = Color(0xFF450A0A),

    outline = Color(0xFF334155)
)

private val RouteMasterShapes = Shapes(
    small = RoundedCornerShape(12.dp),
    medium = RoundedCornerShape(18.dp),
    large = RoundedCornerShape(24.dp)
)

@Composable
fun RouteMasterTheme(
    content: @Composable () -> Unit
) {
    MaterialTheme(
        colorScheme = RouteMasterDarkColorScheme,
        typography = Typography(),
        shapes = RouteMasterShapes,
        content = content
    )
}