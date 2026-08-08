package com.donationhub.app.bluetoothprinter

import android.annotation.SuppressLint
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.text.LineBreaker
import android.text.Layout
import android.text.Spannable
import android.text.SpannableStringBuilder
import android.text.StaticLayout
import android.text.TextPaint
import android.text.style.StyleSpan
import com.getcapacitor.JSObject
import kotlin.math.ceil
import kotlin.math.roundToInt

/**
 * Renders the receipt into a monochrome raster bitmap using Android's native
 * Unicode text stack (Canvas + Paint + StaticLayout + system font).
 *
 * The phone renders Marathi/Devanagari, Latin, digits and the rupee symbol
 * itself, so the printed output never depends on the printer's internal
 * character code page. The result is a 1-bit black-on-white image suitable
 * for any generic ESC/POS raster-capable thermal printer.
 *
 * This renderer is intentionally generic:
 *  - The printable dot width is derived from the paper width only
 *    (58mm -> 384 dots, 80mm -> 576 dots); new widths can be registered in
 *    [paperWidthDots] without touching printer-specific code.
 *  - No printer brand, model or manufacturer is referenced anywhere.
 *
 * Everything runs on the caller's background thread; bitmaps are recycled as
 * soon as the raster bytes have been extracted.
 */
internal object ReceiptBitmapRenderer {

    /** Printable dot width per paper width in millimetres. */
    internal val paperWidthDots = mapOf(58 to 384, 80 to 576)

    private const val DEFAULT_PAPER_WIDTH_MM = 58
    private const val DEFAULT_WIDTH_DOTS = 384

    /** Oversampling factor: glyphs render at 2x then downscale to print dots. */
    private const val SAMPLE_SCALE = 2

    /** Body text height in print dots. */
    private const val TEXT_HEIGHT_DOTS = 26

    /** Blank line height in print dots. */
    private const val BLANK_LINE_DOTS = 10

    /** Solid separator rule thickness in print dots. */
    private const val RULE_THICKNESS_DOTS = 3

    /** Printer-only developer credit; never emitted to other receipt outputs. */
    internal const val DEVELOPER_CREDIT = "Developed by Gajendra Punekar"

    /** Monochrome raster ready to be wrapped into ESC/POS raster commands. */
    internal data class RasterImage(
        val widthDots: Int,
        val heightDots: Int,
        val bytesPerLine: Int,
        val bytes: ByteArray
    )

    private sealed class ReceiptLine {
        class Text(val text: CharSequence, val center: Boolean) : ReceiptLine()
        object Blank : ReceiptLine()
        object Rule : ReceiptLine()
    }

    private fun widthDots(receipt: JSObject): Int {
        val paperMm = receipt.optInt("paperWidth", DEFAULT_PAPER_WIDTH_MM)
        return paperWidthDots[paperMm] ?: DEFAULT_WIDTH_DOTS
    }

    /**
     * Builds the printable line list from the shared JS receipt lines and
     * appends the printer-only footer (separator rule + developer credit).
     */
    private fun buildLines(receipt: JSObject): List<ReceiptLine> {
        val result = ArrayList<ReceiptLine>()

        val jsonLines = receipt.optJSONArray("lines")
        if (jsonLines != null) {
            for (i in 0 until jsonLines.length()) {
                val jsonLine = jsonLines.optJSONObject(i) ?: continue
                val segments = jsonLine.optJSONArray("segments")

                var hasContent = false
                val spannable = SpannableStringBuilder()

                if (segments != null) {
                    for (j in 0 until segments.length()) {
                        val segment = segments.optJSONObject(j) ?: continue
                        val text = segment.optString("text", "")
                        val start = spannable.length
                        spannable.append(text)
                        if (segment.optBoolean("bold", false) && spannable.length > start) {
                            spannable.setSpan(
                                StyleSpan(Typeface.BOLD),
                                start,
                                spannable.length,
                                Spannable.SPAN_EXCLUSIVE_EXCLUSIVE
                            )
                        }
                        if (text.isNotEmpty()) hasContent = true
                    }
                }

                if (!hasContent || spannable.isBlank()) {
                    result.add(ReceiptLine.Blank)
                    continue
                }

                result.add(
                    ReceiptLine.Text(
                        spannable,
                        jsonLine.optString("align", "left") == "center"
                    )
                )
            }
        }

        // Printer-only footer. These lines exist solely on the physical
        // Bluetooth print; they are not part of the shared receipt text.
        result.add(ReceiptLine.Blank)
        result.add(ReceiptLine.Rule)
        result.add(ReceiptLine.Blank)
        result.add(ReceiptLine.Text(SpannableStringBuilder(DEVELOPER_CREDIT), false))

        return result
    }

    /**
     * Renders the receipt to a monochrome raster image.
     *
     * Text is word-wrapped by [StaticLayout] to the printable width, so long
     * donor names, long amount-in-words and long Marathi lines wrap instead
     * of being clipped. The bitmap height grows with the wrapped content.
     */
    @SuppressLint("InlinedApi") // BREAK_STRATEGY_SIMPLE is a compile-time constant; valid on all supported APIs
    internal fun renderReceipt(receipt: JSObject): RasterImage {
        val dotsPerLine = widthDots(receipt)
        val scale = SAMPLE_SCALE
        val canvasWidth = dotsPerLine * scale

        val lines = buildLines(receipt)

        val paint = TextPaint(TextPaint.ANTI_ALIAS_FLAG).apply {
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.NORMAL)
            textSize = (TEXT_HEIGHT_DOTS * scale).toFloat()
            color = Color.BLACK
        }
        val fontMetrics = paint.fontMetrics
        val textLineHeightPx = ceil(fontMetrics.descent - fontMetrics.ascent).toInt()
        val blankLineHeightPx = BLANK_LINE_DOTS * scale
        val ruleThicknessPx = RULE_THICKNESS_DOTS * scale

        // Pass 1: measure every line and compute the full bitmap height.
        val layouts = ArrayList<Pair<ReceiptLine, StaticLayout?>>(lines.size)
        var contentHeightPx = 0

        for (line in lines) {
            when (line) {
                is ReceiptLine.Text -> {
                    val layout = StaticLayout.Builder
                        .obtain(line.text, 0, line.text.length, paint, canvasWidth)
                        .setAlignment(
                            if (line.center) Layout.Alignment.ALIGN_CENTER
                            else Layout.Alignment.ALIGN_NORMAL
                        )
                        .setIncludePad(false)
                        .setBreakStrategy(LineBreaker.BREAK_STRATEGY_SIMPLE)
                        .setHyphenationFrequency(Layout.HYPHENATION_FREQUENCY_NONE)
                        .build()
                    layouts.add(line to layout)
                    contentHeightPx += layout.height
                }
                is ReceiptLine.Blank -> {
                    layouts.add(line to null)
                    contentHeightPx += textLineHeightPx
                }
                is ReceiptLine.Rule -> {
                    layouts.add(line to null)
                    contentHeightPx += blankLineHeightPx / 2 + ruleThicknessPx + blankLineHeightPx
                }
            }
        }

        val heightDots = maxOf(1, (contentHeightPx.toDouble() / scale).roundToInt())

        // Pass 2: draw the receipt.
        val rendered = Bitmap.createBitmap(canvasWidth, contentHeightPx, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(rendered)
        canvas.drawColor(Color.WHITE)

        var y = 0
        for ((line, layout) in layouts) {
            when (line) {
                is ReceiptLine.Text -> {
                    canvas.save()
                    canvas.translate(0f, y.toFloat())
                    layout?.draw(canvas)
                    canvas.restore()
                    y += layout?.height ?: 0
                }
                is ReceiptLine.Blank -> y += textLineHeightPx
                is ReceiptLine.Rule -> {
                    y += blankLineHeightPx / 2
                    canvas.drawRect(0f, y.toFloat(), canvasWidth.toFloat(), (y + ruleThicknessPx).toFloat(), paint)
                    y += ruleThicknessPx + blankLineHeightPx
                }
            }
        }

        val scaled = Bitmap.createScaledBitmap(rendered, dotsPerLine, heightDots, true)
        rendered.recycle()

        // Pass 3: extract 1-bit raster bytes (1 = black pixel, MSB first).
        val pixels = IntArray(scaled.width * scaled.height)
        scaled.getPixels(pixels, 0, scaled.width, 0, 0, scaled.width, scaled.height)
        val bytesPerLine = scaled.width / 8
        val data = ByteArray(bytesPerLine * scaled.height)

        for (row in 0 until scaled.height) {
            val rowOffset = row * bytesPerLine
            for (byteIndex in 0 until bytesPerLine) {
                var value = 0
                for (bit in 0 until 8) {
                    val pixel = pixels[row * scaled.width + byteIndex * 8 + bit]
                    val luminance = (Color.red(pixel) + Color.green(pixel) + Color.blue(pixel)) / 3
                    if (luminance < 128) value = value or (0x80 shr bit)
                }
                data[rowOffset + byteIndex] = value.toByte()
            }
        }
        scaled.recycle()

        return RasterImage(scaled.width, scaled.height, bytesPerLine, data)
    }
}