import PDFDocument from 'pdfkit';
import {
  buildReceiptLines,
  type ReceiptInput,
  type ReceiptLine,
} from '../../frontend/src/utils/receipt.js';
import {
  NOTO_SANS_DEVANAGARI_BOLD_BASE64,
  NOTO_SANS_DEVANAGARI_REGULAR_BASE64,
} from './devNagariFont.js';

/**
 * Server-side rendering of the shared receipt template to a PDF.
 *
 * The browser renderer (frontend/src/utils/receiptPdf.ts) draws the lines on
 * a canvas and embeds the image, because jsPDF cannot shape Devanagari. The
 * server has no DOM, so this module reproduces the exact same layout —
 * identical template, constants, wrapping and centering — with PDFKit, whose
 * fontkit engine shapes Devanagari (GSUB ligatures) from the embedded
 * Noto Sans Devanagari faces. Donors therefore see the same receipt design
 * that the collector downloads.
 */

const PAGE_WIDTH_PT = 595.28; // A4
const PAGE_HEIGHT_PT = 841.89;
const MARGIN_PT = 48;
const FONT_SIZE_PT = 12;
const LINE_GAP_PT = 20;
const CONTENT_WIDTH_PT = PAGE_WIDTH_PT - MARGIN_PT * 2;
const TOP_PAD_PT = 6;

const FONT_REGULAR = 'NotoDeva';
const FONT_BOLD = 'NotoDevaBold';

/**
 * Noto Sans Devanagari ascender (hhea) is 896 units per 1000 em. The canvas
 * renderer uses textBaseline "top", so the ascent line sits on the row's y;
 * PDFKit positions text by baseline, so the baseline is y + size * ratio.
 */
const FONT_ASCENT_RATIO = 896 / 1000;

interface PrintSegment {
  text: string;
  bold: boolean;
  center: boolean;
}

/**
 * Wraps the template lines into printable rows that fit the page width.
 * Each row is a list of segments (usually one per word) that are drawn
 * side by side, so long lines wrap naturally instead of every word landing
 * on its own line. Mirrors the browser wrap logic.
 */
function wrapLines(doc: PDFKit.PDFDocument, lines: ReceiptLine[]): PrintSegment[][] {
  const measure = (text: string, bold: boolean): number => {
    doc.font(bold ? FONT_BOLD : FONT_REGULAR);
    return doc.widthOfString(text);
  };

  const out: PrintSegment[][] = [];

  for (const line of lines) {
    const blank = line.segments.every((segment) => segment.text.trim() === '');

    if (blank) {
      out.push([]);
      continue;
    }

    const printLine: PrintSegment[] = [];
    let width = 0;

    const flush = () => {
      if (printLine.length > 0) {
        out.push(
          printLine.map((segment) => ({
            ...segment,
            center: line.align === 'center',
          })),
        );
        printLine.length = 0;
        width = 0;
      }
    };

    for (const segment of line.segments) {
      const words = segment.text.split(' ');

      for (const word of words) {
        if (word === '') continue;

        const prefix = printLine.length === 0 ? '' : ' ';
        const wordWidth = measure(prefix + word, !!segment.bold);

        if (printLine.length > 0 && width + wordWidth > CONTENT_WIDTH_PT) flush();

        if (width + wordWidth > CONTENT_WIDTH_PT) {
          let rest = prefix + word;
          while (rest.length > 0) {
            let take = rest.length;
            while (
              take > 1 &&
              measure(rest.slice(0, take), !!segment.bold) > CONTENT_WIDTH_PT
            ) {
              take--;
            }
            printLine.push({
              text: rest.slice(0, take),
              bold: !!segment.bold,
              center: line.align === 'center',
            });
            width += measure(rest.slice(0, take), !!segment.bold);
            rest = rest.slice(take);
            if (rest.length > 0) flush();
          }
          continue;
        }

        printLine.push({
          text: prefix + word,
          bold: !!segment.bold,
          center: line.align === 'center',
        });
        width += wordWidth;
      }
    }

    flush();
  }

  return out;
}

export function generateReceiptPdf(input: ReceiptInput): PDFKit.PDFDocument {
  const doc = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: true });
  doc.registerFont(FONT_REGULAR, Buffer.from(NOTO_SANS_DEVANAGARI_REGULAR_BASE64, 'base64'));
  doc.registerFont(FONT_BOLD, Buffer.from(NOTO_SANS_DEVANAGARI_BOLD_BASE64, 'base64'));
  doc.fontSize(FONT_SIZE_PT);

  const wrapped = wrapLines(doc, buildReceiptLines(input));

  const linesPerPage = Math.max(
    1,
    Math.floor(
      (PAGE_HEIGHT_PT - MARGIN_PT * 2 - TOP_PAD_PT * 2) / LINE_GAP_PT,
    ),
  );

  // Paginate whole rows so words never land on separate lines.
  const pages: PrintSegment[][][] = [];
  let current: PrintSegment[][] = [];

  for (const row of wrapped) {
    if (current.length >= linesPerPage) {
      pages.push(current);
      current = [];
    }
    current.push(row);
  }
  if (current.length > 0) pages.push(current);

  pages.forEach((pageRows, pageIndex) => {
    if (pageIndex > 0) doc.addPage();

    let y = MARGIN_PT + TOP_PAD_PT;

    for (const row of pageRows) {
      if (row.length === 0) {
        y += LINE_GAP_PT;
        continue;
      }

      const firstSegment = row[0];
      if (!firstSegment) {
        y += LINE_GAP_PT;
        continue;
      }

      const center = firstSegment.center;

      if (center) {
        const totalWidth = row.reduce(
          (sum, segment) =>
            sum + doc.font(segment.bold ? FONT_BOLD : FONT_REGULAR).widthOfString(segment.text),
          0,
        );
        let x = MARGIN_PT + (CONTENT_WIDTH_PT - totalWidth) / 2;

        for (const segment of row) {
          doc.font(segment.bold ? FONT_BOLD : FONT_REGULAR);
          doc.text(segment.text, x, y + FONT_SIZE_PT * FONT_ASCENT_RATIO, {
            lineBreak: false,
            width: CONTENT_WIDTH_PT,
          });
          x += doc.widthOfString(segment.text);
        }
      } else {
        let x = MARGIN_PT;

        for (const segment of row) {
          doc.font(segment.bold ? FONT_BOLD : FONT_REGULAR);
          doc.text(segment.text, x, y + FONT_SIZE_PT * FONT_ASCENT_RATIO, {
            lineBreak: false,
            width: CONTENT_WIDTH_PT,
          });
          x += doc.widthOfString(segment.text);
        }
      }

      y += LINE_GAP_PT;
    }
  });

  return doc;
}

/** Renders the receipt and collects the PDF bytes. */
export function generateReceiptPdfBuffer(input: ReceiptInput): Promise<Buffer> {
  const doc = generateReceiptPdf(input);

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}
