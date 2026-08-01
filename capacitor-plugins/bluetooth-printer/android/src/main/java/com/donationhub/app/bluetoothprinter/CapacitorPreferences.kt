package com.donationhub.app.bluetoothprinter

import android.content.Context
import android.content.SharedPreferences
import java.lang.reflect.Method

/**
 * Thin native access to the official Capacitor Preferences plugin
 * (com.capacitorjs.plugins.preferences.Preferences), which stores values in the
 * SharedPreferences group "CapacitorStorage". The web side can read/write the
 * exact same values through @capacitor/preferences.
 *
 * The Preferences constructor is package-private (visible only to the plugin's
 * own package), so the instance is created reflectively. If the
 * @capacitor/preferences module is not bundled in the app, we fall back to a
 * SharedPreferences file with the identical name, so behavior never changes.
 */
object CapacitorPreferences {

    private const val GROUP = "CapacitorStorage"

    private interface Storage {
        fun get(key: String): String?
        fun set(key: String, value: String)
        fun remove(key: String)
    }

    private class CapacitorPreferencesStorage(context: Context) : Storage {
        private val instance: Any
        private val getMethod: Method
        private val setMethod: Method
        private val removeMethod: Method

        init {
            val configClass =
                Class.forName("com.capacitorjs.plugins.preferences.PreferencesConfiguration")
            val defaults = configClass.getDeclaredField("DEFAULTS").apply {
                isAccessible = true
            }.get(null)
            val prefsClass = Class.forName("com.capacitorjs.plugins.preferences.Preferences")
            val constructor = prefsClass.getDeclaredConstructor(Context::class.java, configClass)
            constructor.isAccessible = true
            instance = constructor.newInstance(context.applicationContext, defaults)
            getMethod = prefsClass.getMethod("get", String::class.java)
            setMethod = prefsClass.getMethod("set", String::class.java, String::class.java)
            removeMethod = prefsClass.getMethod("remove", String::class.java)
        }

        override fun get(key: String): String? = getMethod.invoke(instance, key) as? String

        override fun set(key: String, value: String) {
            setMethod.invoke(instance, key, value)
        }

        override fun remove(key: String) {
            removeMethod.invoke(instance, key)
        }
    }

    private class SharedPreferencesStorage(context: Context) : Storage {
        private val prefs: SharedPreferences =
            context.applicationContext.getSharedPreferences(GROUP, Context.MODE_PRIVATE)

        override fun get(key: String): String? = prefs.getString(key, null)

        override fun set(key: String, value: String) {
            prefs.edit().putString(key, value).apply()
        }

        override fun remove(key: String) {
            prefs.edit().remove(key).apply()
        }
    }

    @Volatile
    private var storage: Storage? = null

    private fun storage(context: Context): Storage {
        storage?.let { return it }
        synchronized(this) {
            storage?.let { return it }
            val created = try {
                CapacitorPreferencesStorage(context)
            } catch (_: ClassNotFoundException) {
                SharedPreferencesStorage(context)
            }
            storage = created
            return created
        }
    }

    fun get(context: Context, key: String): String? = storage(context).get(key)

    fun set(context: Context, key: String, value: String) {
        storage(context).set(key, value)
    }

    fun remove(context: Context, key: String) {
        storage(context).remove(key)
    }
}
