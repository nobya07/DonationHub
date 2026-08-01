package com.donationhub.app.bluetoothprinter

import com.getcapacitor.JSObject
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

    private var pendingPrintCall: PluginCall? = null
    private var pendingReceipt: JSObject? = null

    override fun load() {
        service = BluetoothPrinterService(context, this)
    }

    @PluginMethod
    fun getStatus(call: PluginCall) {
        call.resolve(service.getStatus())
    }

    @PluginMethod
    fun listDevices(call: PluginCall) {
        if (!service.isBluetoothAvailable()) {
            call.reject("Bluetooth is not available or is turned off")
            return
        }
        call.resolve(service.listDevices())
    }

    @PluginMethod
    fun selectDevice(call: PluginCall) {
        val address = call.getString("address")
        if (address.isNullOrBlank()) {
            call.reject("Device address is required")
            return
        }
        call.resolve(service.selectDevice(address))
    }

    @PluginMethod
    fun testPrint(call: PluginCall) {
        pendingPrintCall = call
        pendingReceipt = null
        ensurePrintPermission()
    }

    @PluginMethod
    fun printReceipt(call: PluginCall) {
        val receipt = call.getObject("receipt")
        if (receipt == null) {
            call.reject("Receipt data is required")
            return
        }
        pendingPrintCall = call
        pendingReceipt = receipt
        ensurePrintPermission()
    }

    private fun ensurePrintPermission() {
        if (!hasRequiredPermissions()) {
            requestAllPermissions(PRINT_PERMISSION_CALLBACK)
        } else {
            startPrint()
        }
    }

    @PermissionCallback
    private fun printPermissionCallback(call: PluginCall) {
        if (call.hasPermission("bluetoothConnect")) {
            startPrint()
        } else {
            call.reject("Bluetooth permission was denied")
        }
    }

    private fun startPrint() {
        val call = pendingPrintCall ?: return

        service.print(
            pendingReceipt,
            onSuccess = { message ->
                call.resolve(JSObject().apply {
                    put("success", true)
                    put("message", message)
                })
                pendingPrintCall = null
                pendingReceipt = null
            },
            onFailure = { message ->
                call.reject(message)
                pendingPrintCall = null
                pendingReceipt = null
            }
        )
    }

    fun notifyStatusChange(status: JSObject) {
        notifyListeners("statusChange", status, true)
    }

    companion object {
        private const val PRINT_PERMISSION_CALLBACK = "printPermissionCallback"
    }
}
