package com.salik.tv

import android.content.Context
import org.json.JSONArray
import java.util.Locale

/** App language for native screens: the choice made in Settings (salikLang), else the device language. */
object Lang {
    fun isEnglish(context: Context): Boolean {
        val saved = context.getSharedPreferences("salik_ext_storage", Context.MODE_PRIVATE)
            .getString("local::salikLang", null)
            ?.let { runCatching { JSONArray(it).getString(0) }.getOrNull() }
        return when (saved) {
            "en" -> true
            "ar" -> false
            else -> Locale.getDefault().language != "ar"
        }
    }

    fun t(context: Context, ar: String, en: String) = if (isEnglish(context)) en else ar
}
