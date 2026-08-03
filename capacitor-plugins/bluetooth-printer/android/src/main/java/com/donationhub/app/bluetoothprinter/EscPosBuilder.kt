package com.donationhub.app.bluetoothprinter

import com.getcapacitor.JSObject
import java.nio.charset.Charset
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * Builds ESC/POS byte sequences for 58mm (32 chars) and 80mm (48 chars)
 * thermal printers. All text is encoded as UTF-8.
 */
object EscPosBuilder {

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
     * Renders the structured receipt lines produced by the shared JS receipt
     * template. Bold/alignment come from the line metadata, so the printed
     * receipt always matches the WhatsApp/PDF/details-page layout.
     */
    fun receipt(receipt: JSObject): ByteArray {
        val width = when (receipt.optInt("paperWidth", 58)) {
            80 -> 48
            else -> 32
        }

        val lines = receipt.optJSONArray("lines") ?: return build {
            initialize()
            feed(3)
            cut()
        }

        return build {
            initialize()

            for (i in 0 until lines.length()) {
                val line = lines.optJSONObject(i) ?: continue
                val align = line.optString("align", "left")
                val segments = line.optJSONArray("segments")

                if (segments == null || segments.length() == 0) {
                    spacer()
                    continue
                }

                val isEmpty = (0 until segments.length()).all { j ->
                    segments.optJSONObject(j)?.optString("text", "")?.isBlank() != false
                }

                if (isEmpty) {
                    spacer()
                    continue
                }

                align(if (align == "center") 1 else 0)

                for (j in 0 until segments.length()) {
                    val segment = segments.optJSONObject(j) ?: continue
                    val text = segment.optString("text", "")
                    val bold = segment.optBoolean("bold", false)

                    bold(bold)

                    val rendered = wrap(text, width)
                    if (align == "center") {
                        rendered.forEach { text(center(it, width)) }
                    } else {
                        rendered.forEach { text(it) }
                    }

                    bold(false)
                }
            }

            feed(3)
            cut()
        }
    }
}
