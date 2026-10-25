package com.salik.tv

import android.content.Context
import android.util.Log
import java.io.File
import java.text.SimpleDateFormat
import java.util.ArrayDeque
import java.util.Date
import java.util.Locale

/** Logcat + in-memory ring buffer, so the user can share a diagnostic log from inside the app. */
object SalikLog {
    private const val MAX_LINES = 1500
    private val lines = ArrayDeque<String>()
    private val fmt = SimpleDateFormat("HH:mm:ss.SSS", Locale.US)
    private var current: File? = null
    private var previous: File? = null

    /** Persists the log to disk so a crash doesn't lose it; keeps the previous session's log too. */
    @Synchronized
    fun init(context: Context) {
        if (current != null) return
        val dir = File(context.filesDir, "logs").apply { mkdirs() }
        current = File(dir, "current.txt")
        previous = File(dir, "previous.txt")
        if (current!!.exists() && current!!.length() > 0) {
            previous!!.delete()
            current!!.renameTo(previous!!)
        }
        current = File(dir, "current.txt").apply { writeText("") }

        val previousHandler = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, error ->
            e("CRASH", "Uncaught in ${thread.name}: ${Log.getStackTraceString(error).take(3000)}")
            previousHandler?.uncaughtException(thread, error)
        }
    }

    @Synchronized
    fun previousSession(): String = previous?.takeIf { it.exists() }?.readText().orEmpty()

    @Synchronized
    private fun add(level: String, tag: String, msg: String, t: Throwable?) {
        val line = "${fmt.format(Date())} $level/$tag: $msg" + (t?.let { " | ${it.javaClass.simpleName}: ${it.message}" } ?: "")
        if (lines.size >= MAX_LINES) lines.removeFirst()
        lines.addLast(line)
        try { current?.appendText(line + "\n") } catch (e: Exception) {}
    }

    fun d(tag: String, msg: String) { Log.d(tag, msg); add("D", tag, msg, null) }
    fun w(tag: String, msg: String, t: Throwable? = null) { Log.w(tag, msg, t); add("W", tag, msg, t) }
    fun e(tag: String, msg: String, t: Throwable? = null) { Log.e(tag, msg, t); add("E", tag, msg, t) }

    @Synchronized
    fun dump(): String = lines.joinToString("\n")
}
