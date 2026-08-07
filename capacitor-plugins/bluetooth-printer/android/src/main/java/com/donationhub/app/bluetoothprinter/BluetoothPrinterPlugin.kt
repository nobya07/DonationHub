package com.donationhub.app.bluetoothprinter

import android.content.Intent
import android.provider.Settings
import android.util.Log
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback

@CapacitorPlugin(
    name = "BluetoothPrinter",
    permissions = [
        Permission(
            alias = "bluetoothConnect",
            strings = ["android.permission.BLUETOOTH_CONNECT"]
        ),
        Permission(
            alias = "bluetoothScan",
            strings = ["android.permission.BLUETOOTH_SCAN"]
        )
    ]
)
class BluetoothPrinterPlugin : Plugin() {

    private var service: BluetoothPrinterService? = null

    override fun load() {
        service = BluetoothPrinterService(context, this)
        Log.i(TAG, "Bluetooth printer plugin loaded")
    }

    override fun handleOnResume() {
        super.handleOnResume()
        Log.d(TAG, "App resumed; notifying service")
        service?.onAppResume()
    }

    override fun handleOnDestroy() {
        super.handleOnDestroy()
        Log.i(TAG, "Plugin destroyed; shutting down service")
        service?.shutdown()
        service = null
    }

    @PluginMethod
    fun getPairedPrinters(call: PluginCall) {
        if (service?.isBluetoothAvailable() != true) {
            call.reject("Please enable Bluetooth and try again.")
            return
        }
        withPermission(call, ::getPairedPrintersInternal)
    }

    private fun getPairedPrintersInternal(call: PluginCall) {
        call.resolve(service?.getPairedPrinters() ?: JSObject().apply { put("devices", com.getcapacitor.JSArray()) })
    }

    @PluginMethod
    fun connect(call: PluginCall) {
        val macAddress = call.getString("macAddress")
        if (macAddress.isNullOrBlank()) {
            call.reject("Printer MAC address is required")
            return
        }
        if (service?.isBluetoothAvailable() != true) {
            call.reject("Please enable Bluetooth and try again.")
            return
        }
        withPermission(call, ::connectInternal)
    }

    private fun connectInternal(call: PluginCall) {
        val macAddress = call.getString("macAddress").orEmpty()
        service?.connect(
            macAddress,
            onSuccess = { message ->
                call.resolve(JSObject().apply {
                    put("success", true)
                    put("message", message)
                })
            },
            onFailure = { message -> call.reject(message) }
        ) ?: call.reject("Printer service is not available")
    }

    @PluginMethod
    fun disconnect(call: PluginCall) {
        service?.disconnect(
            onSuccess = { message ->
                call.resolve(JSObject().apply {
                    put("success", true)
                    put("message", message)
                })
            },
            onFailure = { message -> call.reject(message) }
        ) ?: call.reject("Printer service is not available")
    }

    @PluginMethod
    fun printReceipt(call: PluginCall) {
        val receipt = call.getObject("receipt")
        if (receipt == null) {
            call.reject("Receipt data is required")
            return
        }
        withPermission(call, ::printReceiptInternal)
    }

    private fun printReceiptInternal(call: PluginCall) {
        service?.print(
            call.getObject("receipt"),
            onSuccess = { message ->
                call.resolve(JSObject().apply {
                    put("success", true)
                    put("message", message)
                })
            },
            onFailure = { message -> call.reject(message) }
        ) ?: call.reject("Printer service is not available")
    }

    @PluginMethod
    fun testPrint(call: PluginCall) {
        withPermission(call, ::testPrintInternal)
    }

    private fun testPrintInternal(call: PluginCall) {
        service?.print(
            null,
            onSuccess = { message ->
                call.resolve(JSObject().apply {
                    put("success", true)
                    put("message", message)
                })
            },
            onFailure = { message -> call.reject(message) }
        ) ?: call.reject("Printer service is not available")
    }

    @PluginMethod
    fun getConnectedPrinter(call: PluginCall) {
        call.resolve(service?.getConnectedPrinter() ?: JSObject())
    }

    @PluginMethod
    fun clearSavedPrinter(call: PluginCall) {
        service?.clearSavedPrinter(
            onSuccess = { message ->
                call.resolve(JSObject().apply {
                    put("success", true)
                    put("message", message)
                })
            },
            onFailure = { message -> call.reject(message) }
        ) ?: call.reject("Printer service is not available")
    }

    @PluginMethod
    fun isBluetoothEnabled(call: PluginCall) {
        call.resolve(JSObject().apply {
            put("enabled", service?.isBluetoothAvailable() == true)
        })
    }

    @PluginMethod
    fun openBluetoothSettings(call: PluginCall) {
        try {
            val intent = Intent(Settings.ACTION_BLUETOOTH_SETTINGS)
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            getContext().startActivity(intent)
            call.resolve()
        } catch (e: Exception) {
            Log.e(TAG, "Could not open Bluetooth settings", e)
            call.reject("Could not open Bluetooth settings")
        }
    }

    /**
     * Runs [action] when all required Bluetooth permissions are granted,
     * otherwise asks for them and resumes [action] from the permission
     * callback. Capacitor serializes permission requests per plugin, so
     * concurrent calls are handled safely.
     */
    private fun withPermission(call: PluginCall, action: (PluginCall) -> Unit) {
        if (hasRequiredPermissions()) {
            action(call)
            return
        }
        logPermissionState("before request (${call.methodName})")
        Log.i(TAG, "Requesting Bluetooth permissions for '${call.methodName}'")
        requestAllPermissions(call, PERMISSION_CALLBACK)
    }

    @PermissionCallback
    private fun permissionCallback(call: PluginCall) {
        logPermissionState("result for '${call.methodName}'")

        if (getPermissionState(ALIAS_CONNECT) != PermissionState.GRANTED) {
            call.reject(MSG_PERMISSION_REQUIRED)
            return
        }

        when (call.methodName) {
            "getPairedPrinters" -> getPairedPrintersInternal(call)
            "connect" -> connectInternal(call)
            "printReceipt" -> printReceiptInternal(call)
            "testPrint" -> testPrintInternal(call)
            else -> call.reject("Unknown operation")
        }
    }

    private fun logPermissionState(context: String) {
        Log.d(
            TAG,
            "Permission state $context: connect=${getPermissionState(ALIAS_CONNECT)} " +
                "scan=${getPermissionState(ALIAS_SCAN)}"
        )
    }

    fun notifyStatusChange(status: JSObject) {
        try {
            notifyListeners("statusChange", status, true)
        } catch (e: Exception) {
            Log.w(TAG, "Failed to notify status change", e)
        }
    }

    companion object {
        private const val TAG = "BluetoothPrinterPlugin"
        private const val PERMISSION_CALLBACK = "permissionCallback"
        private const val ALIAS_CONNECT = "bluetoothConnect"
        private const val ALIAS_SCAN = "bluetoothScan"
        const val MSG_PERMISSION_REQUIRED =
            "Bluetooth permission required. Allow Bluetooth access for this app in Settings and try again."
    }
}
