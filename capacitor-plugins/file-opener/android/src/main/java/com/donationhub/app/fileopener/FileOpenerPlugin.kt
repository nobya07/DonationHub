package com.donationhub.app.fileopener

import android.content.Intent
import android.net.Uri
import androidx.core.content.FileProvider
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.File

@CapacitorPlugin(name = "FileOpener")
class FileOpenerPlugin : Plugin() {

    @PluginMethod
    fun openFile(call: PluginCall) {
        val path = call.getString("path") ?: run {
            call.reject("Must provide a file path")
            return
        }
        val mimeType = call.getString("mimeType")

        val parsed = Uri.parse(path)
        val contentUri = if (parsed.scheme == "file") {
            val file = File(parsed.path ?: "")
            if (file.exists()) {
                // The app's own FileProvider (declared in the app manifest) grants
                // other apps read access to our saved file.
                FileProvider.getUriForFile(context, context.packageName + ".fileprovider", file)
            } else parsed
        } else {
            parsed
        }

        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(contentUri, mimeType ?: guessMimeType(path))
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }

        try {
            activity.startActivity(intent)
            call.resolve()
        } catch (ex: Exception) {
            call.reject("No app found to open this file", ex)
        }
    }

    private fun guessMimeType(path: String): String = when (path.substringAfterLast('.', "").lowercase()) {
        "pdf" -> "application/pdf"
        "csv" -> "text/csv"
        "xls" -> "application/vnd.ms-excel"
        "xlsx" -> "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        else -> "*/*"
    }
}
