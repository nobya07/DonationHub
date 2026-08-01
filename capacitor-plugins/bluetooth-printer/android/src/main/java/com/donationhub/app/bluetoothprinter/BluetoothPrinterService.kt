package com.donationhub.app.bluetoothprinter

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothSocket
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
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

class BluetoothPrinterService(
    private val context: Context,
    private val plugin: BluetoothPrinterPlugin
) {

    private val mainHandler = Handler(Looper.getMainLooper())

    /**
     * Serial executor: every Bluetooth operation (connect, print, disconnect,
     * clear) runs here one after another. This gives FIFO job queueing and
     * guarantees no two jobs ever touch the socket at the same time.
     */
    private val ioQueue: ExecutorService = Executors.newSingleThreadExecutor()

    /**
     * Pool for the blocking calls (socket.connect, stream.write) that may hang
     * on a bad printer. Each call is bounded by Future.get(...) timeouts and
     * force-closing the socket unblocks it, so the serial queue always stays
     * responsive.
     */
    private val blockingPool: ExecutorService = Executors.newCachedThreadPool()

    private val sppUuid: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")

    /** Tracks running + queued print job keys to reject duplicate prints. */
    private val jobs = JobQueue()

    @Volatile
    private var socket: BluetoothSocket? = null

    @Volatile
    private var connectedDevice: BluetoothDevice? = null

    private fun adapter(): BluetoothAdapter? {
        val manager = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
        return manager?.adapter ?: BluetoothAdapter.getDefaultAdapter()
    }

    fun isBluetoothAvailable(): Boolean = adapter()?.isEnabled == true

    fun getPairedPrinters(): JSObject {
        val result = JSObject()
        val devices = JSArray()
        val adapter = adapter()
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

    fun getConnectedPrinter(): JSObject {
        val device = connectedDevice
        val connected = device != null && socket?.isConnected == true
        val savedAddress = rememberedAddress()
        val savedName = rememberedName()

        val result = JSObject()
        result.put("connected", connected)
        result.put("deviceName", if (connected) safeDeviceName(device) else savedName)
        result.put("address", if (connected) device.address else savedAddress)
        result.put(
            "state",
            when {
                connected -> "connected"
                savedAddress != null -> "offline"
                else -> "idle"
            }
        )
        result.put(
            "message",
            when {
                connected -> "Printer connected"
                savedAddress != null -> "Printer offline - will auto-reconnect on print"
                else -> "No printer selected"
            }
        )
        result.put("pending", jobs.pendingCount())
        result.put("lastPrintTime", rememberedLastPrintTime() ?: JSObject.NULL)
        return result
    }

    fun connect(macAddress: String, onSuccess: (String) -> Unit, onFailure: (String) -> Unit) {
        ioQueue.execute {
            try {
                if (!isBluetoothAvailable()) {
                    mainHandler.post { onFailure("Bluetooth is turned off") }
                    postStatus("offline", "Bluetooth is turned off")
                    return@execute
                }
                val device = findBondedDevice(macAddress)
                    ?: throw IOException("Printer not paired with this phone. Pair it in Bluetooth settings first.")
                Log.i(TAG, "Connecting to ${safeDeviceName(device)} ($macAddress)")
                connectWithRetry(device)
                CapacitorPreferences.set(context, KEY_ADDRESS, device.address)
                CapacitorPreferences.set(context, KEY_NAME, safeDeviceName(device))
                Log.i(TAG, "Connected to ${safeDeviceName(device)}")
                mainHandler.post { onSuccess("Connected to ${safeDeviceName(device)}") }
                postStatus("connected", "Printer connected")
            } catch (e: TimeoutException) {
                Log.e(TAG, "Connect timed out for $macAddress", e)
                forceClose()
                mainHandler.post { onFailure(e.message ?: "Connection timed out") }
                postStatus("offline", "Printer not connected")
            } catch (e: Exception) {
                Log.e(TAG, "Connect failed for $macAddress", e)
                forceClose()
                mainHandler.post { onFailure(e.message ?: "Connection failed") }
                postStatus("offline", "Printer not connected")
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
                mainHandler.post { onFailure(e.message ?: "Disconnect failed") }
            }
        }
    }

    fun clearSavedPrinter(onSuccess: (String) -> Unit, onFailure: (String) -> Unit) {
        ioQueue.execute {
            try {
                CapacitorPreferences.remove(context, KEY_ADDRESS)
                CapacitorPreferences.remove(context, KEY_NAME)
                CapacitorPreferences.remove(context, KEY_LAST_PRINT)
                forceClose()
                Log.i(TAG, "Saved printer cleared")
                mainHandler.post { onSuccess("Saved printer cleared") }
                postStatus("idle", "No printer selected")
            } catch (e: Exception) {
                Log.e(TAG, "Clear saved printer failed", e)
                mainHandler.post { onFailure(e.message ?: "Could not clear saved printer") }
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
                    context,
                    KEY_LAST_PRINT,
                    System.currentTimeMillis().toString()
                )
                Log.i(TAG, "Print job completed: ${jobKey.take(64)}")
                mainHandler.post { onSuccess("Print job sent to $deviceName") }
                postStatus("connected", "Print complete")
            } catch (e: TimeoutException) {
                Log.e(TAG, "Print job timed out: ${jobKey.take(64)}", e)
                forceClose()
                mainHandler.post { onFailure(e.message ?: "Print timed out") }
                postStatus("offline", "Printer not connected")
            } catch (e: Exception) {
                Log.e(TAG, "Print job failed: ${jobKey.take(64)}", e)
                forceClose()
                mainHandler.post { onFailure(e.message ?: "Print failed") }
                postStatus("offline", "Printer not connected")
            } finally {
                jobs.finish(jobKey)
                Log.i(TAG, "Print job finished: ${jobKey.take(64)}")
            }
        }
    }

    /** Auto-reconnects, prints, and retries the write once after reconnecting. */
    private fun printInternal(receipt: JSObject?): String {
        val device = resolveDevice()
            ?: throw IOException("No printer selected. Choose a printer first.")

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
        val saved = rememberedAddress()
        if (saved != null) {
            return findBondedDevice(saved)
        }
        return null
    }

    @SuppressLint("MissingPermission")
    private fun findBondedDevice(macAddress: String): BluetoothDevice? {
        val adapter = adapter() ?: return null
        for (device in adapter.bondedDevices) {
            if (device.address.equals(macAddress, ignoreCase = true)) return device
        }
        return null
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

    /** Retries the connection once (2 attempts total), each bounded by CONNECT_TIMEOUT_MS. */
    private fun connectWithRetry(device: BluetoothDevice) {
        var lastError: Exception? = null
        for (attempt in 1..MAX_CONNECT_ATTEMPTS) {
            Log.i(TAG, "Connection attempt $attempt/$MAX_CONNECT_ATTEMPTS")
            try {
                attemptConnect(device, attempt)
                Log.i(TAG, "Connection established on attempt $attempt")
                return
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
        adapter()?.cancelDiscovery()
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
            throw TimeoutException(
                "Connection timed out after ${CONNECT_TIMEOUT_MS / 1000} seconds. " +
                    "Make sure the printer is powered on, in range, and not busy."
            )
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
        val out: OutputStream = socket?.outputStream
            ?: throw IOException("Printer is not connected")

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
            throw TimeoutException(
                "Print timed out after ${WRITE_TIMEOUT_MS / 1000} seconds. " +
                    "The printer is not responding."
            )
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

    private fun safeDeviceName(device: BluetoothDevice): String {
        return try {
            device.name ?: device.address
        } catch (_: Exception) {
            device.address
        }
    }

    private fun rememberedAddress(): String? = CapacitorPreferences.get(context, KEY_ADDRESS)

    private fun rememberedName(): String? = CapacitorPreferences.get(context, KEY_NAME)

    private fun rememberedLastPrintTime(): Long? =
        CapacitorPreferences.get(context, KEY_LAST_PRINT)?.toLongOrNull()

    private fun postStatus(state: String, message: String) {
        val status = JSObject()
        status.put("connected", state == "connected")
        status.put(
            "deviceName",
            connectedDevice?.let { safeDeviceName(it) } ?: rememberedName()
        )
        status.put("address", connectedDevice?.address ?: rememberedAddress())
        status.put("state", state)
        status.put("message", message)
        status.put("pending", jobs.pendingCount())
        status.put("lastPrintTime", rememberedLastPrintTime() ?: JSObject.NULL)
        mainHandler.post { plugin.notifyStatusChange(status) }
    }

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
    }
}
