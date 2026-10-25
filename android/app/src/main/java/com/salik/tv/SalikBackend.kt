package com.salik.tv

import android.content.Context
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * The library of titles + filter timings, with no accounts.
 *
 * Source order: the open library on GitHub (same file the extension reads, SalikConfig.LIBRARY_URL)
 * -> the last copy saved on the device -> the snapshot bundled in the app (assets/data/library.json).
 * So the app always works offline/first-run, and picks up new titles as soon as the library is public.
 *
 * Network methods are BLOCKING: call them from a background thread.
 */
class SalikBackend private constructor(private val context: Context) {

    companion object {
        private const val TAG = "SalikBackend"
        private const val LIBRARY_TTL_MS = 10 * 60 * 1000L

        @Volatile private var instance: SalikBackend? = null
        fun get(context: Context): SalikBackend =
            instance ?: synchronized(this) {
                instance ?: SalikBackend(context.applicationContext).also { instance = it }
            }
    }

    private val diskFile = File(context.filesDir, "library.json")
    private var cache: JSONObject? = null
    private var cacheRaw: String? = null
    private var fetchedAt = 0L

    /** Where the current copy came from: "online", "saved" or "bundled" (shown in Settings). */
    @Volatile var source: String = "bundled"
        private set

    /** Raw JSON for the catalog UI. [preferLocal] = open instantly from the saved/bundled copy. */
    fun libraryRaw(preferLocal: Boolean): String {
        if (preferLocal) {
            synchronized(this) { cacheRaw }?.let { return it }
            return localRaw().also { raw -> synchronized(this) { cacheRaw = raw; cache = null } }
        }
        library(force = true)
        return synchronized(this) { cacheRaw } ?: localRaw()
    }

    @Synchronized
    fun library(force: Boolean = false): JSONObject {
        val c = cache
        if (!force && c != null && System.currentTimeMillis() - fetchedAt < LIBRARY_TTL_MS) return c
        val online = runCatching { fetchOnline() }.onFailure {
            SalikLog.w(TAG, "Online library unavailable (${it.message}); using ${if (diskFile.exists()) "saved" else "bundled"} copy")
        }.getOrNull()
        if (online != null) {
            val parsed = JSONObject(online)
            cache = parsed; cacheRaw = online; fetchedAt = System.currentTimeMillis(); source = "online"
            runCatching { diskFile.writeText(online) }
            return parsed
        }
        if (c != null) { fetchedAt = System.currentTimeMillis() - LIBRARY_TTL_MS + 60_000; return c }
        val raw = cacheRaw ?: localRaw()
        return JSONObject(raw).also { cache = it; cacheRaw = raw; fetchedAt = System.currentTimeMillis() - LIBRARY_TTL_MS + 60_000 }
    }

    /** Saved copy, unless the app was installed/updated after it was saved (then the bundled copy is newer). */
    private fun localRaw(): String {
        val appUpdatedAt = runCatching { context.packageManager.getPackageInfo(context.packageName, 0).lastUpdateTime }.getOrDefault(0L)
        if (diskFile.exists() && diskFile.lastModified() >= appUpdatedAt) { source = "saved"; return diskFile.readText() }
        source = "bundled"
        return context.assets.open("data/library.json").bufferedReader(Charsets.UTF_8).use { it.readText() }
    }

    private fun fetchOnline(): String {
        val conn = URL(SalikConfig.LIBRARY_URL).openConnection() as HttpURLConnection
        try {
            conn.connectTimeout = 15_000
            conn.readTimeout = 30_000
            val code = conn.responseCode
            if (code !in 200..299) throw IllegalStateException("HTTP $code")
            val body = conn.inputStream.bufferedReader(Charsets.UTF_8).use { it.readText() }
            if (!body.trimStart().startsWith("{")) throw IllegalStateException("not a library")
            return body
        } finally {
            conn.disconnect()
        }
    }

    /** Same response shape Background.js sends to isolated.script.js (FETCH_FILTERS_BACKGROUND). */
    fun fetchFilters(movieIdRaw: String): JSONObject {
        val movieId = movieIdRaw.trim().replace("%3A", ":").replace("%3a", ":")
        val lib = try { library() } catch (e: Exception) {
            return JSONObject().put("success", false).put("error", e.message ?: "FETCH_FAILED")
        }
        val item = findItem(lib, movieId) ?: return JSONObject().put("success", false).put("error", "Not Found")
        SalikLog.d(TAG, "Found item for $movieId: ${item.optString("title")}")
        return JSONObject().put("success", true).put("data", normalizePlatformKeys(item))
    }

    private val stremioIdRe = Regex("^tt\\d{7,9}(?::\\d+:\\d+)?$", RegexOption.IGNORE_CASE)
    private val stremioMovieOrSeriesRe = Regex("^tt\\d{7,9}$", RegexOption.IGNORE_CASE)

    private fun findItem(lib: JSONObject, movieId: String): JSONObject? {
        if (movieId.isEmpty()) return null
        if (stremioIdRe.matches(movieId)) {
            val bare = stremioMovieOrSeriesRe.matches(movieId)
            val keys = lib.keys()
            while (keys.hasNext()) {
                val key = keys.next()
                val item = lib.optJSONObject(key) ?: continue
                val type = item.optString("type")
                if (type == "series") continue
                if (bare && type == "episode") continue
                val platforms = item.optJSONObject("platforms") ?: continue
                val st = platformEntry(platforms, "stremio") ?: continue
                val sid = st.opt("id")?.toString()?.replace("%3A", ":")?.replace("%3a", ":")
                if (sid != null && sid.equals(movieId, ignoreCase = true)) {
                    return JSONObject(item.toString()).put("_libraryKey", key)
                }
            }
            return null
        }
        lib.optJSONObject(movieId)?.let { if (it.optString("type") != "series") return JSONObject(it.toString()).put("_libraryKey", movieId) }
        val keys = lib.keys()
        while (keys.hasNext()) {
            val key = keys.next()
            val item = lib.optJSONObject(key) ?: continue
            if (item.optString("type") == "series") continue
            val platforms = item.optJSONObject("platforms") ?: continue
            val pKeys = platforms.keys()
            while (pKeys.hasNext()) {
                val p = platforms.optJSONObject(pKeys.next()) ?: continue
                val pid = p.opt("id")?.toString()
                val url = p.optString("url", "")
                if (pid == movieId || (url.isNotEmpty() && idAppearsAsWholeSegment(url, movieId))) {
                    return JSONObject(item.toString()).put("_libraryKey", key)
                }
            }
        }
        return null
    }

    private fun platformEntry(platforms: JSONObject, name: String): JSONObject? {
        platforms.optJSONObject(name)?.let { return it }
        val keys = platforms.keys()
        while (keys.hasNext()) { val k = keys.next(); if (k.equals(name, ignoreCase = true)) return platforms.optJSONObject(k) }
        return null
    }

    /** The engine looks platforms up by lowercase name (offset_seconds etc.); guard against "Netflix". */
    private fun normalizePlatformKeys(item: JSONObject): JSONObject {
        val platforms = item.optJSONObject("platforms") ?: return item
        val fixed = JSONObject()
        val keys = platforms.keys()
        while (keys.hasNext()) {
            val k = keys.next()
            val lower = k.lowercase()
            if (!fixed.has(lower) || k == lower) fixed.put(lower, platforms.get(k))
        }
        return item.put("platforms", fixed)
    }

    private fun idAppearsAsWholeSegment(url: String, id: String): Boolean {
        if (id.length < 3) return false
        if (id.none { it.isDigit() } && id.length < 8) return false
        val re = Regex("(^|[^0-9A-Za-z])" + Regex.escape(id) + "($|[^0-9A-Za-z])")
        return re.containsMatchIn(url)
    }
}
