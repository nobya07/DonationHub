package com.donationhub.app.bluetoothprinter

import android.util.Log
import com.getcapacitor.JSObject
import java.nio.charset.Charset
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * Builds ESC/POS byte sequences for generic 58mm and 80mm thermal printers.
 *
 * Text helpers (text/align/bold/center/wrap) remain for the diagnostic test
 * print and for raw-text callers. Receipt printing goes through the Unicode
 * bitmap renderer ([ReceiptBitmapRenderer]) and the generic GS v 0 raster
 * command, so Marathi/Devanagari prints correctly on any ESC/POS bitmap
 * capable printer without relying on a printer code page.
 */
object EscPosBuilder {

    private const val TAG = "EscPosBuilder"

    private val utf8: Charset = Charsets.UTF_8

    private fun MutableList<Byte>.raw(bytes: ByteArray) {
        bytes.forEach { add(it) }
    }

    private fun MutableList<Byte>.initialize() {
        raw(byteArrayOf(0x1B, 0x40))
    }

    private fun MutableList<Byte>.align(n: Int) {
        raw(byteArrayOf(0x1B, 0x61, n.toByte()))
    }

    private fun MutableList<Byte>.bold(on: Boolean) {
        raw(byteArrayOf(0x1B, 0x45, if (on) 1 else 0))
    }

    private fun MutableList<Byte>.doubleHeight(on: Boolean) {
        raw(byteArrayOf(0x1D, 0x21, if (on) 0x11 else 0x00))
    }

    private fun MutableList<Byte>.text(value: String) {
        raw(value.toByteArray(utf8))
    }

    private fun MutableList<Byte>.feed(lines: Int) {
        repeat(lines) { add(0x0A) }
    }

    /**
     * Generic ESC/POS raster image (GS v 0): one raster command per printed
     * row keeps every frame small, so small Bluetooth stacks never have to
     * buffer a huge image. This works on any ESC/POS bitmap capable printer
     * and contains no printer-brand-specific bytes.
     */
    private fun MutableList<Byte>.rasterImage(image: ReceiptBitmapRenderer.RasterImage) {
        val data = image.bytes
        for (row in 0 until image.heightDots) {
            raw(
                byteArrayOf(
                    0x1D, 0x76, 0x30, 0x30, // GS v 0, mode '0' (1:1)
                    image.bytesPerLine.toByte(), 0x00, // xL xH (bytes per row)
                    0x01, 0x00 // yL yH (one row per command)
                )
            )
            val offset = row * image.bytesPerLine
            for (i in 0 until image.bytesPerLine) {
                add(data[offset + i])
            }
        }
    }

    private fun MutableList<Byte>.cut() {
        raw(byteArrayOf(0x1D, 0x56, 0x42, 0x00))
    }

    private fun MutableList<Byte>.separator(width: Int) {
        text("-".repeat(width))
    }

    private fun MutableList<Byte>.spacer() {
        feed(1)
    }

    private fun center(value: String, width: Int): String {
        val padding = ((width - value.length) / 2).coerceAtLeast(0)
        return " ".repeat(padding) + value
    }

    /**
     * Word-aware wrapping so long values (address, purpose, names) never
     * overflow the printable line width.
     */
    private fun wrap(value: String, width: Int): List<String> {
        if (value.isEmpty()) return listOf("")
        if (value.length <= width) return listOf(value)

        val words = value.split(" ")
        val lines = mutableListOf<String>()
        var current = ""

        for (word in words) {
            var piece = word
            while (piece.length > width) {
                if (current.isNotEmpty()) {
                    lines.add(current)
                    current = ""
                }
                lines.add(piece.substring(0, width))
                piece = piece.substring(width)
            }
            if (current.isEmpty()) {
                current = piece
            } else if (current.length + 1 + piece.length <= width) {
                current += " $piece"
            } else {
                lines.add(current)
                current = piece
            }
        }
        if (current.isNotEmpty()) lines.add(current)
        return lines
    }

    /** "Label: value" row, left-aligned, wrapped if needed. */
    private fun MutableList<Byte>.infoRow(label: String, value: String, width: Int, boldValue: Boolean = false) {
        if (value.isBlank()) return
        val lines = wrap("$label: $value", width)
        if (boldValue) bold(true)
        lines.forEach { text(it) }
        if (boldValue) bold(false)
    }

    private inline fun build(block: MutableList<Byte>.() -> Unit): ByteArray {
        val bytes = mutableListOf<Byte>()
        bytes.block()
        return bytes.toByteArray()
    }

    fun testPrint(): ByteArray = build {
        initialize()
        align(1)
        doubleHeight(true)
        bold(true)
        text(center("अष्टविनायक युवक मंडळ", 32))
        doubleHeight(false)
        bold(false)
        spacer()
        bold(true)
        text(center("Printer Test", 32))
        bold(false)
        text(center(SimpleDateFormat("dd MMM yyyy", Locale.ENGLISH)
            .apply { timeZone = TimeZone.getTimeZone("Asia/Kolkata") }
            .format(Date()), 32))
        align(0)
        feed(3)
        cut()
    }

    /**
     * Prints the receipt as a Unicode bitmap so Devanagari/Marathi, Latin,
     * digits and the rupee symbol print correctly on any generic ESC/POS
     * raster-capable printer. The shared JS receipt template provides the
     * content; the bitmap renderer adds the printer-only developer footer.
     */
    fun receipt(receipt: JSObject): ByteArray {
        val image = try {
            ReceiptBitmapRenderer.renderReceipt(receipt)
        } catch (e: Exception) {
            Log.e(TAG, "Receipt bitmap rendering failed", e)
            throw RuntimeException("Receipt could not be rendered", e)
        }

        return build {
            initialize()
            rasterImage(image)
            feed(3)
            cut()
        }
    }
}
