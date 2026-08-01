package com.donationhub.app.bluetoothprinter

import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothSocket
import android.content.Context
import android.content.SharedPreferences
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.getcapacitor.JSObject
import java.io.IOException
import java.io.OutputStream
import java.nio.charset.Charset
import java.util.UUID

class BluetoothPrinterService(
    private val context: Context,
    private val plugin: BluetoothPrinterPlugin
) {

    private val prefs: SharedPreferences =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    private val sppUuid: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")

    private var socket: BluetoothSocket? = null
    private val mainHandler = Handler(Looper.getMainLooper())

    fun isBluetoothAvailable(): Boolean {
        val adapter = BluetoothAdapter.getDefaultAdapter() ?: return false
        return adapter.isEnabled
    }

    private fun rememberedAddress(): String? = prefs.getString(KEY_ADDRESS, null)

    private fun rememberedName(): String? = prefs.getString(KEY_NAME, null)

    fun isConnected(): Boolean = socket?.isConnected == true

    fun getStatus(): JSObject {
        val connected = isConnected()
        val remembered = rememberedName()

        val result = JSObject()
        result.put("connected", connected)
        result.put(
            "deviceName",
            if (connected) socket?.remoteDevice?.name ?: remembered
            else remembered
        )
        result.put(
            "state",
            when {
                connected -> "connected"
                remembered != null -> "offline"
                else -> "idle"
            }
        )
        result.put(
            "message",
            when {
                connected -> "Printer connected"
                remembered != null -> "Printer offline - will auto-reconnect on print"
                else -> "No printer selected"
            }
        )
        return result
    }

    fun listDevices(): JSObject {
        val adapter = BluetoothAdapter.getDefaultAdapter()
        val result = JSObject()
        val devices = com.getcapacitor.JSArray()

        if (adapter != null && adapter.isEnabled) {
            for (device in adapter.bondedDevices) {
                val item = JSObject()
                item.put("name", safeDeviceName(device))
                item.put("address", device.address)
                devices.put(item)
            }
        }

        result.put("devices", devices)
        return result
    }

    fun selectDevice(address: String): JSObject {
        val adapter = BluetoothAdapter.getDefaultAdapter()
        val device = adapter?.getRemoteDevice(address)

        if (device == null) {
            return JSObject().apply {
                put("success", false)
                put("message", "Unknown device address")
            }
        }

        prefs.edit()
            .putString(KEY_ADDRESS, device.address)
            .putString(KEY_NAME, safeDeviceName(device))
            .apply()

        return JSObject().apply {
            put("success", true)
            put("message", "Printer selected: ${safeDeviceName(device)}")
        }
    }

    fun print(receipt: JSObject?, onSuccess: (String) -> Unit, onFailure: (String) -> Unit) {
        Thread {
            try {
                val device = resolveDevice()
                    ?: run {
                        postStatus("offline", "No printer selected")
                        mainHandler.post { onFailure("No printer selected. Pair a printer first.") }
                        return@Thread
                    }

                ensureConnected(device)

                postStatus("printing", "Printing...")

                val bytes = if (receipt == null) EscPosBuilder.testPrint() else EscPosBuilder.receipt(receipt)
                writeBytes(bytes)

                mainHandler.post { onSuccess("Print job sent to ${safeDeviceName(device)}") }
                postStatus("connected", "Print complete")
            } catch (e: Exception) {
                Log.e(TAG, "Print failed", e)
                closeSocket()
                postStatus("offline", "Printer offline")
                mainHandler.post { onFailure(e.message ?: "Print failed") }
            }
        }.start()
    }

    private fun resolveDevice(): BluetoothDevice? {
        val adapter = BluetoothAdapter.getDefaultAdapter() ?: return null

        val remembered = rememberedAddress()
        if (remembered != null) {
            try {
                return adapter.getRemoteDevice(remembered)
            } catch (_: IllegalArgumentException) {
                // invalid stored address; fall through to paired devices
            }
        }

        for (device in adapter.bondedDevices) {
            if (device.address == remembered) return device
        }
        return adapter.bondedDevices.firstOrNull()
    }

    private fun ensureConnected(device: BluetoothDevice) {
        if (isConnected()) return

        val candidate = device.createRfcommSocketToServiceRecord(sppUuid)
        candidate.connect()
        socket = candidate
        postStatus("connected", "Printer connected")
    }

    private fun writeBytes(bytes: ByteArray) {
        val out: OutputStream = socket?.outputStream
            ?: throw IOException("Printer socket is not open")
        out.write(bytes)
        out.flush()
    }

    private fun closeSocket() {
        try {
            socket?.close()
        } catch (_: IOException) {
            // already closed
        }
        socket = null
    }

    private fun safeDeviceName(device: BluetoothDevice): String {
        return try {
            device.name ?: device.address
        } catch (_: SecurityException) {
            device.address
        }
    }

    private fun postStatus(state: String, message: String) {
        val status = JSObject()
        status.put("connected", state == "connected")
        status.put("deviceName", rememberedName())
        status.put("state", state)
        status.put("message", message)
        mainHandler.post { plugin.notifyStatusChange(status) }
    }

    companion object {
        private const val TAG = "BluetoothPrinter"
        private const val PREFS_NAME = "bluetooth_printer_prefs"
        private const val KEY_ADDRESS = "last_printer_address"
        private const val KEY_NAME = "last_printer_name"
    }
}
