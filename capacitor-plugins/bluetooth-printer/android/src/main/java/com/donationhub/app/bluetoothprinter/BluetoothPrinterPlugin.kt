package com.donationhub.app.bluetoothprinter

import android.content.Intent
import android.provider.Settings
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
        )
    ]
)
class BluetoothPrinterPlugin : Plugin() {

    private lateinit var service: BluetoothPrinterService

    private var pendingPermissionCall: PluginCall? = null

    override fun load() {
        service = BluetoothPrinterService(context, this)
    }

    @PluginMethod
    fun getPairedPrinters(call: PluginCall) {
        if (!service.isBluetoothAvailable()) {
            call.reject("Bluetooth is disabled. Turn on Bluetooth to see paired printers.")
            return
        }
        withPermission(call, ::getPairedPrintersInternal)
    }

    private fun getPairedPrintersInternal(call: PluginCall) {
        call.resolve(service.getPairedPrinters())
    }

    @PluginMethod
    fun connect(call: PluginCall) {
        val macAddress = call.getString("macAddress")
        if (macAddress.isNullOrBlank()) {
            call.reject("Printer MAC address is required")
            return
        }
        withPermission(call, ::connectInternal)
    }

    private fun connectInternal(call: PluginCall) {
        val macAddress = call.getString("macAddress").orEmpty()
        service.connect(
            macAddress,
            onSuccess = { message ->
                call.resolve(JSObject().apply {
                    put("success", true)
                    put("message", message)
                })
            },
            onFailure = { message -> call.reject(message) }
        )
    }

    @PluginMethod
    fun disconnect(call: PluginCall) {
        service.disconnect(
            onSuccess = { message ->
                call.resolve(JSObject().apply {
                    put("success", true)
                    put("message", message)
                })
            },
            onFailure = { message -> call.reject(message) }
        )
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
        service.print(
            call.getObject("receipt"),
            onSuccess = { message ->
                call.resolve(JSObject().apply {
                    put("success", true)
                    put("message", message)
                })
            },
            onFailure = { message -> call.reject(message) }
        )
    }

    @PluginMethod
    fun testPrint(call: PluginCall) {
        withPermission(call, ::testPrintInternal)
    }

    private fun testPrintInternal(call: PluginCall) {
        service.print(
            null,
            onSuccess = { message ->
                call.resolve(JSObject().apply {
                    put("success", true)
                    put("message", message)
                })
            },
            onFailure = { message -> call.reject(message) }
        )
    }

    @PluginMethod
    fun getConnectedPrinter(call: PluginCall) {
        call.resolve(service.getConnectedPrinter())
    }

    @PluginMethod
    fun clearSavedPrinter(call: PluginCall) {
        service.clearSavedPrinter(
            onSuccess = { message ->
                call.resolve(JSObject().apply {
                    put("success", true)
                    put("message", message)
                })
            },
            onFailure = { message -> call.reject(message) }
        )
    }

    @PluginMethod
    fun isBluetoothEnabled(call: PluginCall) {
        call.resolve(JSObject().apply {
            put("enabled", service.isBluetoothAvailable())
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
            call.reject("Could not open Bluetooth settings", e)
        }
    }

    private fun withPermission(call: PluginCall, action: (PluginCall) -> Unit) {
        if (!hasRequiredPermissions()) {
            pendingPermissionCall = call
            requestAllPermissions(call, PERMISSION_CALLBACK)
        } else {
            action(call)
        }
    }

    @PermissionCallback
    private fun permissionCallback(call: PluginCall) {
        val original = pendingPermissionCall
        pendingPermissionCall = null

        if (getPermissionState("bluetoothConnect") != PermissionState.GRANTED) {
            original?.reject("Bluetooth permission was denied")
            return
        }

        when (original?.methodName) {
            "getPairedPrinters" -> getPairedPrintersInternal(original)
            "connect" -> connectInternal(original)
            "printReceipt" -> printReceiptInternal(original)
            "testPrint" -> testPrintInternal(original)
            else -> original?.reject("Unknown operation")
        }
    }

    fun notifyStatusChange(status: JSObject) {
        notifyListeners("statusChange", status, true)
    }

    companion object {
        private const val PERMISSION_CALLBACK = "permissionCallback"
    }
}
