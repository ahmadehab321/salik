package com.salik.tv

/**
 * Salik TV configuration.
 * The Firebase web config values are public by design (same as firebase-config.js in the extension);
 * real protection comes from Firestore rules + Cloud Functions.
 */
object SalikConfig {
    /** Public library (titles + filter timings). Needs ".read": true on /library in database.rules.json. */
    const val LIBRARY_URL = "https://raw.githubusercontent.com/techFek/salik/main/library.json"

    const val START_URL = "https://shahid.mbc.net"

    /** Same hosts as content_scripts.matches in the extension manifest (origin level). */
    val PLATFORM_ORIGINS = setOf(
        "http://*.shahid.mbc.net",
        "http://shahid.mbc.net",
        "https://*.amazon.com",
        "https://*.amazon.eg",
        "https://*.bein.com",
        "https://*.beinconnect.com",
        "https://*.dailymotion.com",
        "https://*.disneyplus.com",
        "https://*.jawwy.tv",
        "https://*.netflix.com",
        "https://*.osnplus.com",
        "https://*.primevideo.com",
        "https://*.shahid.mbc.net",
        "https://*.starzplay.com",
        "https://*.stctv.com",
        "https://*.stremio.com",
        "https://*.tod.tv",
        "https://*.watchit.com",
        "https://*.yango.com",
        "https://amazon.com",
        "https://amazon.eg",
        "https://bein.com",
        "https://beinconnect.com",
        "https://dai.ly",
        "https://dailymotion.com",
        "https://disneyplus.com",
        "https://jawwy.tv",
        "https://netflix.com",
        "https://osnplus.com",
        "https://play.yango.com",
        "https://primevideo.com",
        "https://shahid.mbc.net",
        "https://starzplay.com",
        "https://stctv.com",
        "https://stremio.com",
        "https://tod.tv",
        "https://tv.apple.com",
        "https://watchit.com",
        "https://www.youtube.com",
        "https://yango.com",
        "https://youtube.com"
    )

    /**
     * The user's own Stremio server (e.g. a Docker container on a PC at home), saved in Settings as
     * "192.168.1.10:8080". Returns its origin ("http://192.168.1.10:8080") or null. Stremio's web player
     * needs a streaming server running all the time; Android freezes the Stremio app in the background.
     */
    private fun stremioServerUri(context: android.content.Context): java.net.URI? {
        val raw = context.getSharedPreferences("salik_settings", android.content.Context.MODE_PRIVATE)
            .getString("stremioServer", null)?.trim().orEmpty()
        if (raw.isEmpty()) return null
        val withScheme = if (raw.startsWith("http://") || raw.startsWith("https://")) raw else "http://$raw"
        val u = runCatching { java.net.URI(withScheme) }.getOrNull() ?: return null
        return if (u.host.isNullOrEmpty()) null else u
    }

    /**
     * Two ways to give Stremio its streaming server:
     *  - "192.168.1.23" or "192.168.1.23:11470": the Stremio app on a PC at home. web.stremio.com is used
     *    and told to stream through that PC (see [stremioStreamingUrl]).
     *  - any other port, e.g. "192.168.1.10:8080": a self-hosted Stremio (Docker) that serves its own
     *    web player; Salik opens that address instead of web.stremio.com (see [stremioServerOrigin]).
     */
    fun stremioStreamingUrl(context: android.content.Context): String? {
        val u = stremioServerUri(context) ?: return null
        if (u.port != -1 && u.port != 11470 && u.port != 12470) return null
        val port = if (u.port == -1) 11470 else u.port
        val scheme = if (port == 12470) "https" else "http"
        return "$scheme://${u.host}:$port/"
    }

    fun stremioServerOrigin(context: android.content.Context): String? {
        val u = stremioServerUri(context) ?: return null
        if (u.port == -1 || u.port == 11470 || u.port == 12470) return null
        return "${u.scheme}://${u.host}:${u.port}"
    }

    /** Experimental gender blur: only where the video is not DRM-protected (+ the user's Stremio server). */
    val GENDER_BLUR_ORIGINS = setOf(
        "https://www.youtube.com", "https://youtube.com", "https://m.youtube.com",
        "https://*.dailymotion.com", "https://dailymotion.com",
        "https://*.stremio.com", "https://stremio.com"
    )

    /** Origins that get the engine: the platforms + the user's Stremio server, if any. */
    fun engineOrigins(context: android.content.Context): Set<String> =
        PLATFORM_ORIGINS + listOfNotNull(stremioServerOrigin(context))

    /** Extension content scripts, in manifest order. Group 1 = ISOLATED world, group 2 = MAIN world. */
    val ISOLATED_SCRIPTS = listOf("ext/isolated.script.js", "ext/subtitle-censor-core.js", "ext/subtitles.script.js")
    val MAIN_SCRIPTS = listOf("ext/main.script.js")
}
