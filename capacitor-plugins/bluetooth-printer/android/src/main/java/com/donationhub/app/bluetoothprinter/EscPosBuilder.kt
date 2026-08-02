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
        text(center("DonationHub", 32))
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

    fun receipt(receipt: JSObject): ByteArray {
        val width = when (receipt.optInt("paperWidth", 58)) {
            80 -> 48
            else -> 32
        }

        val templeName = receipt.getString("templeName") ?: "DonationHub"
        val receiptNo = receipt.getString("receiptNo") ?: ""
        val date = receipt.getString("date") ?: ""
        val collectorName = receipt.getString("collectorName") ?: ""
        val donorName = receipt.getString("donorName") ?: ""
        val phone = receipt.getString("phone") ?: ""
        val address = receipt.getString("address") ?: ""
        val purpose = receipt.getString("purpose") ?: ""
        val remarks = receipt.getString("remarks") ?: ""
        val paymentMode = receipt.getString("paymentMode") ?: ""
        val amount = receipt.getString("amount") ?: ""

        return build {
            initialize()

            separator(width)
            align(1)
            doubleHeight(true)
            bold(true)
            templeName.split("\n").forEach { text(center(it.trim(), width)) }
            doubleHeight(false)
            bold(false)
            align(0)
            separator(width)

            spacer()
            infoRow("Receipt Number", receiptNo, width)
            infoRow("Date", date, width)
            infoRow("Collector", collectorName, width)
            infoRow("Donor Name", donorName, width)
            infoRow("Phone", phone, width)
            infoRow("Address", address, width)
            infoRow("Amount", amount, width, boldValue = true)
            infoRow("Payment Mode", paymentMode, width)
            infoRow("Purpose", purpose, width)
            infoRow("Remarks", remarks, width)

            separator(width)
            spacer()

            align(1)
            bold(true)
            text(center("Thank You", width))
            bold(false)
            text(center("Visit Again", width))
            align(0)

            separator(width)

            feed(3)
            cut()
        }
    }
}
