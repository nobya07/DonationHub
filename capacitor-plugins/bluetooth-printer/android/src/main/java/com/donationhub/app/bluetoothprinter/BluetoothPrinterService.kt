package com.donationhub.app.bluetoothprinter

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothSocket
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.core.content.ContextCompat
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import java.io.IOException
import java.io.OutputStream
import java.util.UUID
import java.util.concurrent.Callable
import java.util.concurrent.ExecutionException
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.Future
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong

/**
 * Production-grade Bluetooth Classic (SPP) ESC/POS printing service.
 *
 * Design guarantees:
 * - Every Bluetooth API call is guarded by an API-level-aware permission check.
 * - All blocking calls (connect, write) run on a bounded pool and are forced
 *   to finish by socket close + Future timeouts, so no thread ever leaks.
 * - A system broadcast receiver tracks Bluetooth state, ACL drops and pairing
 *   changes so the UI state is always accurate and reconnection happens as
 *   soon as Bluetooth becomes available again.
 * - All failures are converted to user-friendly messages; no raw exceptions
 *   ever reach the UI.
 */
class BluetoothPrinterService(
    context: Context,
    private val plugin: BluetoothPrinterPlugin
) {

    private val appContext: Context = context.applicationContext
    private val mainHandler = Handler(Looper.getMainLooper())

    /**
     * Serial executor: every Bluetooth operation (connect, print, disconnect,
     * clear, auto-reconnect) runs here one after another. This gives FIFO job
     * queueing and guarantees no two jobs ever touch the socket at the same
     * time.
     */
    private val ioQueue: ExecutorService = Executors.newSingleThreadExecutor { r ->
        Thread(r, "BluetoothPrinter-io").apply { isDaemon = true }
    }

    /**
     * Bounded pool for the blocking calls (socket.connect, stream.write) that
     * may hang on a bad printer. Each call is bounded by Future.get(...)
     * timeouts and force-closing the socket unblocks it, so the serial queue
     * always stays responsive. The pool is capped so a stalled call can never
     * spawn unbounded threads.
     */
    private val blockingPool: ExecutorService = Executors.newFixedThreadPool(BLOCKING_POOL_SIZE) { r ->
        Thread(r, "BluetoothPrinter-blocking").apply { isDaemon = true }
    }

    private val sppUuid: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")

    /** Tracks running + queued print job keys to reject duplicate prints. */
    private val jobs = JobQueue()

    @Volatile
    private var socket: BluetoothSocket? = null

    @Volatile
    private var connectedDevice: BluetoothDevice? = null

    @Volatile
    private var receiverRegistered = false

    private val reconnectInFlight = AtomicBoolean(false)
    private val lastReconnectAttemptMs = AtomicLong(0)

    private val stateReceiver = BluetoothStateReceiver()

    init {
        registerStateReceiver()
    }

    // ------------------------------------------------------------------
    // Permissions (API-level aware)
    // ------------------------------------------------------------------

    /**
     * BLUETOOTH_CONNECT is a runtime permission on Android 12+ (API 31).
     * Below that the legacy BLUETOOTH permission (install-time) covers it.
     */
    private fun hasConnectPermission(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true
        return appContext.checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) ==
            PackageManager.PERMISSION_GRANTED
    }

    /**
     * BLUETOOTH_SCAN is a runtime permission on Android 12+ (API 31).
     * Below that BLUETOOTH_ADMIN (install-time) covers discovery calls.
     */
    private fun hasScanPermission(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true
        return appContext.checkSelfPermission(Manifest.permission.BLUETOOTH_SCAN) ==
            PackageManager.PERMISSION_GRANTED
    }

    /** Throws a user-friendly error when the connect permission is missing. */
    private fun requireConnectPermission() {
        if (!hasConnectPermission()) {
            Log.w(TAG, "BLUETOOTH_CONNECT permission missing; aborting operation")
            throw PermissionMissingException()
        }
    }

    // ------------------------------------------------------------------
    // Adapter access
    // ------------------------------------------------------------------

    private fun adapter(): BluetoothAdapter? {
        return try {
            val manager = appContext.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
            manager?.adapter ?: BluetoothAdapter.getDefaultAdapter()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to get Bluetooth adapter", e)
            null
        }
    }

    fun isBluetoothAvailable(): Boolean {
        return try {
            adapter()?.isEnabled == true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to read Bluetooth state", e)
            false
        }
    }

    // ------------------------------------------------------------------
    // Device listing / status
    // ------------------------------------------------------------------

    fun getPairedPrinters(): JSObject {
        val result = JSObject()
        val devices = JSArray()
        if (!hasConnectPermission()) {
            Log.w(TAG, "getPairedPrinters called without BLUETOOTH_CONNECT permission")
            result.put("devices", devices)
            return result
        }
        try {
            val adapter = adapter()
            if (adapter != null && adapter.isEnabled) {
                for (device in adapter.bondedDevices) {
                    val item = JSObject()
                    item.put("name", safeDeviceName(device))
                    item.put("address", safeDeviceAddress(device))
                    devices.put(item)
                    Log.d(TAG, "Paired device: ${safeDeviceName(device)} (${safeDeviceAddress(device)})")
                }
            }
        } catch (e: SecurityException) {
            Log.e(TAG, "Permission revoked while listing paired devices", e)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to list paired printers", e)
        }
        result.put("devices", devices)
        return result
    }

    fun getConnectedPrinter(): JSObject {
        val device = connectedDevice
        val bluetoothOn = isBluetoothAvailable()
        val connected = bluetoothOn && device != null && socket?.isConnected == true
        val savedAddress = rememberedAddress()
        val savedName = rememberedName()

        val result = JSObject()
        result.put("connected", connected)
        result.put("deviceName", if (connected) safeDeviceName(device) else savedName)
        result.put("address", if (connected) safeDeviceAddress(device) else savedAddress)
        result.put(
            "state",
            when {
                connected -> "connected"
                !bluetoothOn -> "offline"
                savedAddress != null -> "offline"
                else -> "idle"
            }
        )
        result.put(
            "message",
            when {
                connected -> "Printer connected"
                !bluetoothOn -> "Please enable Bluetooth."
                savedAddress != null -> "Printer offline - will auto-reconnect on print"
                else -> "No printer selected"
            }
        )
        result.put("pending", jobs.pendingCount())
        result.put("lastPrintTime", rememberedLastPrintTime() ?: JSObject.NULL)
        return result
    }

    // ------------------------------------------------------------------
    // Connect / disconnect / clear
    // ------------------------------------------------------------------

    fun connect(macAddress: String, onSuccess: (String) -> Unit, onFailure: (String) -> Unit) {
        ioQueue.execute {
            try {
                requireConnectPermission()
                if (!isBluetoothAvailable()) {
                    Log.w(TAG, "Connect rejected: Bluetooth is off")
                    mainHandler.post { onFailure(MSG_ENABLE_BLUETOOTH) }
                    postStatus("offline", MSG_ENABLE_BLUETOOTH)
                    return@execute
                }
                val device = findBondedDevice(macAddress)
                    ?: throw UserMessageException(MSG_NOT_PAIRED)
                Log.i(TAG, "Connecting to ${safeDeviceName(device)} ($macAddress)")
                connectWithRetry(device)
                CapacitorPreferences.set(appContext, KEY_ADDRESS, safeDeviceAddress(device))
                CapacitorPreferences.set(appContext, KEY_NAME, safeDeviceName(device))
                Log.i(TAG, "Connected to ${safeDeviceName(device)}")
                mainHandler.post { onSuccess("Connected to ${safeDeviceName(device)}") }
                postStatus("connected", "Printer connected")
            } catch (e: Exception) {
                Log.e(TAG, "Connect failed for $macAddress", e)
                forceClose()
                mainHandler.post { onFailure(friendlyMessage(e, MSG_UNABLE_TO_CONNECT)) }
                postStatus("offline", "Printer is offline")
            }
        }
    }

    fun disconnect(onSuccess: (String) -> Unit, onFailure: (String) -> Unit) {
        ioQueue.execute {
            try {
                forceClose()
                Log.i(TAG, "Disconnected from printer")
                mainHandler.post { onSuccess("Disconnected from printer") }
                postStatus("idle", "Disconnected from printer")
            } catch (e: Exception) {
                Log.e(TAG, "Disconnect failed", e)
                mainHandler.post { onFailure("Could not disconnect from printer") }
            }
        }
    }

    fun clearSavedPrinter(onSuccess: (String) -> Unit, onFailure: (String) -> Unit) {
        ioQueue.execute {
            try {
                CapacitorPreferences.remove(appContext, KEY_ADDRESS)
                CapacitorPreferences.remove(appContext, KEY_NAME)
                CapacitorPreferences.remove(appContext, KEY_LAST_PRINT)
                forceClose()
                Log.i(TAG, "Saved printer cleared")
                mainHandler.post { onSuccess("Saved printer cleared") }
                postStatus("idle", "No printer selected")
            } catch (e: Exception) {
                Log.e(TAG, "Clear saved printer failed", e)
                mainHandler.post { onFailure("Could not clear saved printer") }
            }
        }
    }

    /**
     * Auto-reconnects to the saved printer before every print job.
     * [receipt] is null for a test print.
     */
    fun print(receipt: JSObject?, onSuccess: (String) -> Unit, onFailure: (String) -> Unit) {
        val jobKey = if (receipt == null) JOB_KEY_TEST else receipt.toString()

        if (!jobs.submit(jobKey)) {
            Log.w(TAG, "Duplicate print rejected: ${jobKey.take(64)}")
            mainHandler.post { onFailure("A print job with the same receipt is already in progress") }
            return
        }
        Log.i(TAG, "Print job queued: ${jobKey.take(64)}")

        ioQueue.execute {
            try {
                val deviceName = printInternal(receipt)
                CapacitorPreferences.set(
                    appContext,
                    KEY_LAST_PRINT,
                    System.currentTimeMillis().toString()
                )
                Log.i(TAG, "Print job completed: ${jobKey.take(64)}")
                mainHandler.post { onSuccess("Print job sent to $deviceName") }
                postStatus("connected", "Print complete")
            } catch (e: Exception) {
                Log.e(TAG, "Print job failed: ${jobKey.take(64)}", e)
                forceClose()
                mainHandler.post { onFailure(friendlyMessage(e, "Print failed. Make sure the printer is powered on and in range.")) }
                postStatus("offline", "Printer is offline")
            } finally {
                jobs.finish(jobKey)
                Log.i(TAG, "Print job finished: ${jobKey.take(64)}")
            }
        }
    }

    /** Auto-reconnects, prints, and retries the write once after reconnecting. */
    private fun printInternal(receipt: JSObject?): String {
        requireConnectPermission()
        if (!isBluetoothAvailable()) {
            Log.w(TAG, "Print rejected: Bluetooth is off")
            throw UserMessageException(MSG_ENABLE_BLUETOOTH)
        }
        val device = resolveDevice()
            ?: throw UserMessageException(MSG_NO_PRINTER_SELECTED)

        connectIfNeeded(device)

        val bytes = if (receipt == null) EscPosBuilder.testPrint() else EscPosBuilder.receipt(receipt)
        try {
            writeBytes(bytes)
        } catch (e: IOException) {
            Log.w(TAG, "Write failed; reconnecting and retrying once: ${e.message}")
            forceClose()
            connectIfNeeded(device)
            writeBytes(bytes)
        }
        return safeDeviceName(device)
    }

    private fun resolveDevice(): BluetoothDevice? {
        val saved = rememberedAddress() ?: return null
        return findBondedDevice(saved)
    }

    @SuppressLint("MissingPermission")
    private fun findBondedDevice(macAddress: String): BluetoothDevice? {
        if (!hasConnectPermission()) return null
        return try {
            val adapter = adapter() ?: return null
            for (device in adapter.bondedDevices) {
                if (safeDeviceAddress(device).equals(macAddress, ignoreCase = true)) return device
            }
            null
        } catch (e: SecurityException) {
            Log.e(TAG, "Missing permission while searching bonded devices", e)
            null
        } catch (e: Exception) {
            Log.e(TAG, "Error searching bonded devices", e)
            null
        }
    }

    /** Auto reconnect: connects only if the current socket is not usable. */
    private fun connectIfNeeded(device: BluetoothDevice) {
        val current = socket
        if (current != null && current.isConnected && connectedDevice == device) {
            Log.i(TAG, "Already connected to ${safeDeviceName(device)}")
            return
        }
        Log.i(TAG, "Connecting to ${safeDeviceName(device)}...")
        connectWithRetry(device)
    }

    /**
     * Retries the connection once (2 attempts total), each bounded by
     * CONNECT_TIMEOUT_MS. A missing permission aborts immediately instead of
     * retrying.
     */
    private fun connectWithRetry(device: BluetoothDevice) {
        var lastError: Exception? = null
        for (attempt in 1..MAX_CONNECT_ATTEMPTS) {
            Log.i(TAG, "Connection attempt $attempt/$MAX_CONNECT_ATTEMPTS to ${safeDeviceName(device)}")
            try {
                attemptConnect(device, attempt)
                Log.i(TAG, "Connection established on attempt $attempt")
                return
            } catch (e: SecurityException) {
                Log.w(TAG, "Attempt $attempt blocked by missing permission", e)
                throw PermissionMissingException()
            } catch (e: TimeoutException) {
                Log.w(TAG, "Attempt $attempt timed out after ${CONNECT_TIMEOUT_MS}ms")
                lastError = e
            } catch (e: Exception) {
                Log.w(TAG, "Attempt $attempt failed: ${e.message}")
                lastError = e
            }
            forceClose()
        }
        throw lastError ?: IOException("Connection failed")
    }

    @SuppressLint("MissingPermission")
    private fun attemptConnect(device: BluetoothDevice, attempt: Int) {
        requireConnectPermission()
        cancelDiscoveryIfAllowed()
        forceClose()

        val candidate: BluetoothSocket = if (attempt == 1) {
            device.createRfcommSocketToServiceRecord(sppUuid)
        } else {
            // Some cheap 58mm printers only accept the deprecated insecure
            // RFCOMM channel; use it on the retry attempt.
            createInsecureRfcommSocket(device)
                ?: device.createRfcommSocketToServiceRecord(sppUuid)
        }

        val future: Future<Boolean> = blockingPool.submit(Callable<Boolean> {
            candidate.connect()
            true
        })
        try {
            future.get(CONNECT_TIMEOUT_MS, TimeUnit.MILLISECONDS)
        } catch (e: TimeoutException) {
            future.cancel(true)
            closeQuietly(candidate) // unblocks a stuck connect()
            throw TimeoutException(MSG_CONNECT_TIMEOUT)
        } catch (e: ExecutionException) {
            closeQuietly(candidate)
            throw (e.cause as? IOException)
                ?: IOException("Connection failed", e.cause)
        } catch (e: InterruptedException) {
            Thread.currentThread().interrupt()
            closeQuietly(candidate)
            throw IOException("Connection interrupted", e)
        }

        socket = candidate
        connectedDevice = device
    }

    private fun cancelDiscoveryIfAllowed() {
        try {
            if (!hasScanPermission()) {
                Log.d(TAG, "Skipping cancelDiscovery (BLUETOOTH_SCAN not granted)")
                return
            }
            adapter()?.cancelDiscovery()
        } catch (e: SecurityException) {
            Log.w(TAG, "cancelDiscovery blocked by permissions", e)
        } catch (e: Exception) {
            Log.w(TAG, "cancelDiscovery failed", e)
        }
    }

    @SuppressLint("DiscouragedPrivateApi")
    private fun createInsecureRfcommSocket(device: BluetoothDevice): BluetoothSocket? {
        return try {
            val method =
                device.javaClass.getMethod("createInsecureRfcommSocket", Int::class.javaPrimitiveType)
            method.invoke(device, 1) as BluetoothSocket
        } catch (e: Exception) {
            Log.w(TAG, "Insecure RFCOMM socket not available: ${e.message}")
            null
        }
    }

    /** Writes with a timeout; force-closes the socket if the printer stalls. */
    private fun writeBytes(bytes: ByteArray) {
        requireConnectPermission()
        val out: OutputStream = socket?.outputStream
            ?: throw UserMessageException(MSG_PRINTER_OFFLINE)

        val future: Future<Boolean> = blockingPool.submit(Callable<Boolean> {
            out.write(bytes)
            out.flush()
            true
        })
        try {
            future.get(WRITE_TIMEOUT_MS, TimeUnit.MILLISECONDS)
        } catch (e: TimeoutException) {
            future.cancel(true)
            forceClose() // unblocks a stuck write()
            throw TimeoutException(MSG_PRINT_TIMEOUT)
        } catch (e: ExecutionException) {
            throw (e.cause as? IOException) ?: IOException("Write failed", e.cause)
        } catch (e: InterruptedException) {
            Thread.currentThread().interrupt()
            throw IOException("Write interrupted", e)
        }
    }

    /** Closes the OutputStream first, then the BluetoothSocket; both guarded. */
    private fun forceClose() {
        val current = socket
        socket = null
        connectedDevice = null
        if (current == null) return

        try {
            current.outputStream?.close()
            Log.d(TAG, "Output stream closed")
        } catch (e: Exception) {
            Log.w(TAG, "Error closing output stream: ${e.message}")
        }
        try {
            current.close()
            Log.d(TAG, "Socket closed")
        } catch (e: Exception) {
            Log.w(TAG, "Error closing socket: ${e.message}")
        }
    }

    private fun closeQuietly(target: BluetoothSocket?) {
        if (target == null) return
        try {
            target.close()
        } catch (e: Exception) {
            Log.w(TAG, "Error closing candidate socket: ${e.message}")
        }
    }

    // ------------------------------------------------------------------
    // Bluetooth state tracking + reconnection
    // ------------------------------------------------------------------

    fun onAppResume() {
        Log.d(TAG, "App resumed; considering reconnection")
        scheduleReconnect()
    }

    /**
     * Attempts to reconnect to the saved printer when Bluetooth comes back
     * or the app resumes. Debounced so repeated events do not spam connects.
     */
    private fun scheduleReconnect() {
        if (!reconnectInFlight.compareAndSet(false, true)) {
            Log.d(TAG, "Reconnect already in progress; skipping")
            return
        }
        if (System.currentTimeMillis() - lastReconnectAttemptMs.get() < RECONNECT_DEBOUNCE_MS) {
            Log.d(TAG, "Reconnect attempted too recently; skipping")
            reconnectInFlight.set(false)
            return
        }
        ioQueue.execute {
            try {
                tryReconnect()
            } catch (e: Exception) {
                Log.w(TAG, "Auto-reconnect failed", e)
                postStatus("offline", "Printer is offline")
            } finally {
                reconnectInFlight.set(false)
            }
        }
    }

    private fun tryReconnect() {
        requireConnectPermission()
        if (!isBluetoothAvailable()) {
            Log.d(TAG, "Bluetooth is off; skipping reconnect")
            return
        }
        val saved = rememberedAddress() ?: return
        if (jobs.pendingCount() > 0) {
            Log.d(TAG, "Print job in progress; skipping auto-reconnect")
            return
        }
        val current = socket
        if (current != null && current.isConnected && connectedDevice != null) {
            Log.d(TAG, "Already connected; skipping auto-reconnect")
            return
        }
        val device = findBondedDevice(saved) ?: run {
            Log.w(TAG, "Saved printer is no longer paired: $saved")
            return
        }
        lastReconnectAttemptMs.set(System.currentTimeMillis())
        Log.i(TAG, "Auto-reconnecting to ${safeDeviceName(device)}")
        connectWithRetry(device)
        Log.i(TAG, "Auto-reconnect established")
        postStatus("connected", "Printer connected")
    }

    private fun onBluetoothStateChanged(state: Int) {
        when (state) {
            BluetoothAdapter.STATE_ON -> {
                Log.i(TAG, "Bluetooth turned ON")
                scheduleReconnect()
            }
            BluetoothAdapter.STATE_TURNING_OFF, BluetoothAdapter.STATE_OFF -> {
                Log.w(TAG, "Bluetooth turned OFF")
                forceClose()
                postStatus("offline", MSG_ENABLE_BLUETOOTH)
            }
            else -> Log.d(TAG, "Bluetooth state changed: $state")
        }
    }

    private fun onAclDisconnected(address: String?) {
        val current = connectedDevice
        if (current == null) return
        if (address != null && !safeDeviceAddress(current).equals(address, ignoreCase = true)) return
        Log.w(TAG, "Printer disconnected (ACL dropped): ${safeDeviceName(current)}")
        forceClose()
        postStatus("offline", "Printer is offline")
    }

    private inner class BluetoothStateReceiver : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            when (intent?.action) {
                BluetoothAdapter.ACTION_STATE_CHANGED -> onBluetoothStateChanged(
                    intent.getIntExtra(BluetoothAdapter.EXTRA_STATE, BluetoothAdapter.ERROR)
                )
                BluetoothDevice.ACTION_ACL_CONNECTED -> {
                    val device = bluetoothDeviceFrom(intent)
                    if (device != null) {
                        Log.i(TAG, "ACL connected: ${safeDeviceName(device)}")
                    }
                }
                BluetoothDevice.ACTION_ACL_DISCONNECTED -> {
                    val device = bluetoothDeviceFrom(intent)
                    onAclDisconnected(device?.let { safeDeviceAddress(it) })
                }
                BluetoothDevice.ACTION_BOND_STATE_CHANGED -> {
                    val device = bluetoothDeviceFrom(intent)
                    val bondState = intent.getIntExtra(
                        BluetoothDevice.EXTRA_BOND_STATE,
                        BluetoothDevice.BOND_NONE
                    )
                    Log.i(
                        TAG,
                        "Bond state changed for ${device?.let { safeDeviceName(it) } ?: "unknown"}: $bondState"
                    )
                }
            }
        }

        private fun bluetoothDeviceFrom(intent: Intent): BluetoothDevice? {
            if (!hasConnectPermission()) {
                Log.d(TAG, "Skipping device extras (BLUETOOTH_CONNECT not granted)")
                return null
            }
            return try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE, BluetoothDevice::class.java)
                } else {
                    @Suppress("DEPRECATION")
                    intent.getParcelableExtra<BluetoothDevice>(BluetoothDevice.EXTRA_DEVICE)
                }
            } catch (e: Exception) {
                Log.w(TAG, "Could not read device extra from broadcast", e)
                null
            }
        }
    }

    private fun registerStateReceiver() {
        if (receiverRegistered) return
        try {
            val filter = IntentFilter().apply {
                addAction(BluetoothAdapter.ACTION_STATE_CHANGED)
                addAction(BluetoothDevice.ACTION_ACL_CONNECTED)
                addAction(BluetoothDevice.ACTION_ACL_DISCONNECTED)
                addAction(BluetoothDevice.ACTION_BOND_STATE_CHANGED)
            }
            ContextCompat.registerReceiver(
                appContext,
                stateReceiver,
                filter,
                ContextCompat.RECEIVER_NOT_EXPORTED
            )
            receiverRegistered = true
            Log.i(TAG, "Bluetooth state receiver registered")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to register Bluetooth state receiver", e)
        }
    }

    /** Releases the receiver, socket and worker threads. Idempotent. */
    fun shutdown() {
        Log.i(TAG, "Shutting down Bluetooth printer service")
        if (receiverRegistered) {
            try {
                appContext.unregisterReceiver(stateReceiver)
            } catch (e: Exception) {
                Log.w(TAG, "Error unregistering receiver", e)
            }
            receiverRegistered = false
        }
        forceClose()
        ioQueue.shutdown()
        blockingPool.shutdown()
        try {
            if (!ioQueue.awaitTermination(2, TimeUnit.SECONDS)) {
                ioQueue.shutdownNow()
            }
            if (!blockingPool.awaitTermination(2, TimeUnit.SECONDS)) {
                blockingPool.shutdownNow()
            }
        } catch (e: InterruptedException) {
            Thread.currentThread().interrupt()
        }
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    @SuppressLint("MissingPermission")
    private fun safeDeviceName(device: BluetoothDevice): String {
        return try {
            device.name ?: safeDeviceAddress(device)
        } catch (_: Exception) {
            safeDeviceAddress(device)
        }
    }

    @SuppressLint("MissingPermission")
    private fun safeDeviceAddress(device: BluetoothDevice): String {
        return try {
            device.address
        } catch (_: Exception) {
            Log.w(TAG, "Could not read device address")
            ""
        }
    }

    private fun rememberedAddress(): String? = CapacitorPreferences.get(appContext, KEY_ADDRESS)

    private fun rememberedName(): String? = CapacitorPreferences.get(appContext, KEY_NAME)

    private fun rememberedLastPrintTime(): Long? =
        CapacitorPreferences.get(appContext, KEY_LAST_PRINT)?.toLongOrNull()

    private fun postStatus(state: String, message: String) {
        val status = JSObject()
        status.put("connected", state == "connected")
        status.put(
            "deviceName",
            connectedDevice?.let { safeDeviceName(it) } ?: rememberedName()
        )
        status.put("address", connectedDevice?.let { safeDeviceAddress(it) } ?: rememberedAddress())
        status.put("state", state)
        status.put("message", message)
        status.put("pending", jobs.pendingCount())
        status.put("lastPrintTime", rememberedLastPrintTime() ?: JSObject.NULL)
        mainHandler.post {
            try {
                plugin.notifyStatusChange(status)
            } catch (e: Exception) {
                Log.w(TAG, "Failed to notify status change", e)
            }
        }
    }

    /** Maps raw exceptions to user-friendly messages. */
    private fun friendlyMessage(e: Throwable, fallback: String): String = when (e) {
        is PermissionMissingException -> e.message ?: BluetoothPrinterPlugin.MSG_PERMISSION_REQUIRED
        is UserMessageException -> e.message ?: fallback
        is TimeoutException -> e.message ?: MSG_CONNECT_TIMEOUT
        is SecurityException -> BluetoothPrinterPlugin.MSG_PERMISSION_REQUIRED
        else -> fallback
    }

    /** Exception carrying a user-friendly message instead of a technical one. */
    private open class UserMessageException(message: String) : Exception(message)

    private class PermissionMissingException : UserMessageException(
        BluetoothPrinterPlugin.MSG_PERMISSION_REQUIRED
    )

    /**
     * Ordered set of print job keys that are running or waiting in the queue.
     * Submission and completion touch different threads, so it is synchronized.
     */
    private class JobQueue {
        private val keys = LinkedHashSet<String>()

        @Synchronized
        fun submit(key: String): Boolean = keys.add(key)

        @Synchronized
        fun finish(key: String) {
            keys.remove(key)
        }

        @Synchronized
        fun pendingCount(): Int = keys.size
    }

    companion object {
        private const val TAG = "BluetoothPrinter"
        private const val KEY_ADDRESS = "last_printer_address"
        private const val KEY_NAME = "last_printer_name"
        private const val KEY_LAST_PRINT = "last_print_time"
        private const val JOB_KEY_TEST = "TEST_PRINT"
        private const val MAX_CONNECT_ATTEMPTS = 2
        private const val CONNECT_TIMEOUT_MS = 10_000L
        private const val WRITE_TIMEOUT_MS = 10_000L
        private const val RECONNECT_DEBOUNCE_MS = 20_000L
        private const val BLOCKING_POOL_SIZE = 2

        private const val MSG_ENABLE_BLUETOOTH = "Please enable Bluetooth and try again."
        private const val MSG_NOT_PAIRED =
            "Printer is not paired with this phone. Pair it in Bluetooth settings first."
        private const val MSG_NO_PRINTER_SELECTED = "No printer selected. Choose a printer first."
        private const val MSG_PRINTER_OFFLINE = "Printer is offline. Make sure it is powered on."
        private const val MSG_UNABLE_TO_CONNECT =
            "Unable to connect to printer. Make sure it is powered on and in range."
        private const val MSG_CONNECT_TIMEOUT =
            "Unable to connect to printer. Make sure it is powered on, in range, and not busy."
        private const val MSG_PRINT_TIMEOUT =
            "Print timed out. The printer is not responding. Make sure it is powered on and in range."
    }
}
