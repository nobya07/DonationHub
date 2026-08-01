package com.donationhub.app.bluetoothprinter

import com.getcapacitor.JSObject
import java.nio.charset.Charset

object EscPosBuilder {

    private const val LINE_WIDTH = 32
    private val utf8: Charset = Charset.forName("UTF-8")

    private fun init(): ByteArray = byteArrayOf(0x1B, 0x40)

    private fun align(n: Int): ByteArray = byteArrayOf(0x1B, 0x61, n.toByte())

    private fun bold(on: Boolean): ByteArray = byteArrayOf(0x1B, 0x45, if (on) 1 else 0)

    private fun doubleHeight(on: Boolean): ByteArray =
        byteArrayOf(0x1D, 0x21, if (on) 0x11 else 0x00)

    private fun text(value: String): ByteArray = value.toByteArray(utf8)

    private fun feed(lines: Int): ByteArray = ByteArray(lines) { 0x0A }

    private fun cut(): ByteArray = byteArrayOf(0x1D, 0x56, 0x42, 0x00)

    private fun center(value: String): String {
        val padding = ((LINE_WIDTH - value.length) / 2).coerceAtLeast(0)
        return " ".repeat(padding) + value
    }

    fun testPrint(): ByteArray {
        val bytes = mutableListOf<Byte>()

        bytes += init()
        bytes += align(1)
        bytes += doubleHeight(true)
        bytes += bold(true)
        bytes += text("DONATIONHUB")
        bytes += doubleHeight(false)
        bytes += bold(false)
        bytes += feed(1)
        bytes += text(center("Test Print"))
        bytes += align(0)
        bytes += feed(1)
        bytes += text("This is a test of your 58mm")
        bytes += text("thermal printer.")
        bytes += feed(1)
        bytes += text(center("If you can read this,"))
        bytes += text(center("your printer works."))
        bytes += feed(2)
        bytes += cut()

        return bytes.toByteArray()
    }

    fun receipt(receipt: JSObject): ByteArray {
        val receiptNo = receipt.getString("receiptNo") ?: ""
        val donorName = receipt.getString("donorName") ?: ""
        val phone = receipt.getString("phone") ?: ""
        val amount = receipt.getString("amount") ?: ""
        val paymentMode = receipt.getString("paymentMode") ?: ""
        val purpose = receipt.getString("purpose") ?: ""
        val collectorName = receipt.getString("collectorName") ?: ""
        val date = receipt.getString("date") ?: ""

        val separator = "-".repeat(LINE_WIDTH)
        val bytes = mutableListOf<Byte>()

        bytes += init()
        bytes += align(1)
        bytes += doubleHeight(true)
        bytes += bold(true)
        bytes += text("DONATIONHUB")
        bytes += doubleHeight(false)
        bytes += bold(false)
        bytes += feed(1)
        bytes += text(center("Donation Receipt"))
        bytes += align(0)
        bytes += feed(1)
        bytes += text(separator)
        bytes += text("Receipt: $receiptNo")
        bytes += text("Date:    $date")
        bytes += text("Collector: $collectorName")
        bytes += text(separator)
        bytes += feed(1)
        bytes += text("Donor: $donorName")
        bytes += text("Phone: $phone")
        bytes += text("Amount: $amount")
        bytes += text("Mode:   $paymentMode")
        if (purpose.isNotBlank()) {
            bytes += text("Purpose: $purpose")
        }
        bytes += feed(1)
        bytes += text(separator)
        bytes += align(1)
        bytes += text("Thank you for your support!")
        bytes += align(0)
        bytes += feed(3)
        bytes += cut()

        return bytes.toByteArray()
    }
}
