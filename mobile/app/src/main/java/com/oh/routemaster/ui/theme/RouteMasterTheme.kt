package com.oh.routemaster.ui.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

private val GoldPrimary = Color(0xFFD8AE5E)
private val GoldSoft = Color(0xFFF2D7A5)
private val GoldLight = Color(0xFFF7ECD6)
private val GoldSurface = Color(0xFFFFFBE6)
private val GoldSurfaceVariant = Color(0xFFFFE0B2)
private val GoldOutline = Color(0xFFD8AE5E)
private val TextDark = Color(0xFF333333)
private val TextMuted = Color(0xFF6E6251)

private val RouteMasterLightColorScheme: ColorScheme = lightColorScheme(
    primary = GoldPrimary,
    onPrimary = Color(0xFF2F230D),

    secondary = Color(0xFF8B6A24),
    onSecondary = Color.White,

    tertiary = Color(0xFF2E7D32),
    onTertiary = Color.White,

    background = GoldLight,
    onBackground = TextDark,

    surface = GoldSurface,
    onSurface = TextDark,

    surfaceVariant = GoldSurfaceVariant,
    onSurfaceVariant = TextMuted,

    error = Color(0xFFB3261E),
    onError = Color.White,

    outline = GoldOutline
)

private val RouteMasterDarkColorScheme: ColorScheme = darkColorScheme(
    primary = GoldPrimary,
    onPrimary = Color(0xFF1F1605),

    secondary = GoldSoft,
    onSecondary = Color(0xFF2A1D06),

    tertiary = Color(0xFFB8D986),
    onTertiary = Color(0xFF142400),

    background = Color(0xFF070A12),
    onBackground = Color(0xFFF7ECD6),

    surface = Color(0xFF111827),
    onSurface = Color(0xFFF7ECD6),

    surfaceVariant = Color(0xFF1F2937),
    onSurfaceVariant = Color(0xFFD9C7A5),

    error = Color(0xFFF87171),
    onError = Color(0xFF450A0A),

    outline = Color(0xFF6F5421)
)

private val RouteMasterShapes = Shapes(
    small = RoundedCornerShape(12.dp),
    medium = RoundedCornerShape(18.dp),
    large = RoundedCornerShape(24.dp)
)

@Composable
fun RouteMasterTheme(
    darkTheme: Boolean = true,
    content: @Composable () -> Unit
) {
    MaterialTheme(
        colorScheme = if (darkTheme) {
            RouteMasterDarkColorScheme
        } else {
            RouteMasterLightColorScheme
        },
        typography = Typography(),
        shapes = RouteMasterShapes,
        content = content
    )
}
