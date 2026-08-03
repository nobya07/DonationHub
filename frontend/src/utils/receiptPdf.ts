import { jsPDF } from 'jspdf';
import {
  buildReceiptLines,
  type ReceiptInput,
  type ReceiptLine,
} from './receipt';

/**
 * Renders the shared receipt template to a PDF. The Devanagari text is drawn
 * on a canvas (the browser applies proper complex-script shaping) and then
 * embedded as an image, since jsPDF's built-in fonts cannot render
 * Devanagari glyphs.
 */

const PAGE_WIDTH_PT = 595.28; // A4
const PAGE_HEIGHT_PT = 841.89;
const MARGIN_PT = 48;
const FONT_SIZE_PT = 12;
const LINE_GAP_PT = 20;
const CONTENT_WIDTH_PT = PAGE_WIDTH_PT - MARGIN_PT * 2;
const SCALE = 2;
const PT_TO_PX = 96 / 72;

const FONT_STACK =
  "'Noto Sans Devanagari', 'Mangal', 'Nirmala UI', 'Sanskrit Text', sans-serif";

interface PrintSegment {
  text: string;
  bold: boolean;
  center: boolean;
}

function setFont(ctx: CanvasRenderingContext2D, bold: boolean, sizePx: number): void {
  ctx.font = `${bold ? '700' : '400'} ${sizePx}px ${FONT_STACK}`;
}

/**
 * Wraps the template lines into printable rows that fit the page width.
 * Each row is a list of segments (usually one per word) that are drawn
 * side by side, so long lines wrap naturally instead of every word landing
 * on its own line.
 */
function wrapLines(lines: ReceiptLine[]): PrintSegment[][] {
  const sizePx = FONT_SIZE_PT * PT_TO_PX * SCALE;
  const maxPx = CONTENT_WIDTH_PT * PT_TO_PX * SCALE;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    return lines.map((line) =>
      line.segments.map((segment) => ({
        text: segment.text,
        bold: !!segment.bold,
        center: line.align === 'center',
      })),
    );
  }

  const measure = (text: string, bold: boolean): number => {
    setFont(ctx, bold, sizePx);
    return ctx.measureText(text).width;
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

        if (printLine.length > 0 && width + wordWidth > maxPx) flush();

        if (width + wordWidth > maxPx) {
          let rest = prefix + word;
          while (rest.length > 0) {
            let take = rest.length;
            while (take > 1 && measure(rest.slice(0, take), !!segment.bold) > maxPx) {
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

export function generateReceiptPdf(input: ReceiptInput): jsPDF {
  const wrapped = wrapLines(buildReceiptLines(input));

  const sizePx = FONT_SIZE_PT * PT_TO_PX * SCALE;
  const gapPx = LINE_GAP_PT * PT_TO_PX * SCALE;
  const topPadPx = Math.round(6 * PT_TO_PX * SCALE);
  const canvasWidthPx = Math.round(CONTENT_WIDTH_PT * PT_TO_PX * SCALE);
  const contentHeightPx =
    (PAGE_HEIGHT_PT - MARGIN_PT * 2) * PT_TO_PX * SCALE;
  const linesPerPage = Math.max(
    1,
    Math.floor((contentHeightPx - topPadPx * 2) / gapPx),
  );

  // Each wrapped entry is one rendered row (a list of segments drawn side
  // by side). Paginate whole rows so words never land on separate lines.
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

  const doc = new jsPDF({ unit: 'pt', format: 'a4' });

  pages.forEach((pageRows, pageIndex) => {
    const heightPx = Math.round(topPadPx * 2 + pageRows.length * gapPx);
    const canvas = document.createElement('canvas');
    canvas.width = canvasWidthPx;
    canvas.height = heightPx;

    const ctx = canvas.getContext('2d');

    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#000000';

      let y = topPadPx;

      for (const row of pageRows) {
        if (row.length === 0) {
          y += gapPx;
          continue;
        }

        const firstSegment = row[0];
        if (!firstSegment) {
          y += gapPx;
          continue;
        }

        const center = firstSegment.center;

        if (center) {
          const totalWidth = row.reduce(
            (sum, segment) => sum + ctx.measureText(segment.text).width,
            0,
          );
          let x = (canvas.width - totalWidth) / 2;

          for (const segment of row) {
            setFont(ctx, segment.bold, sizePx);
            ctx.fillText(segment.text, x, y);
            x += ctx.measureText(segment.text).width;
          }
        } else {
          let x = MARGIN_PT * PT_TO_PX;

          for (const segment of row) {
            setFont(ctx, segment.bold, sizePx);
            ctx.fillText(segment.text, x, y);
            x += ctx.measureText(segment.text).width;
          }
        }

        y += gapPx;
      }
    }

    if (pageIndex > 0) doc.addPage();

    const heightPt = heightPx / PT_TO_PX / SCALE;

    doc.addImage(
      canvas.toDataURL('image/png'),
      'PNG',
      MARGIN_PT,
      MARGIN_PT,
      CONTENT_WIDTH_PT,
      heightPt,
    );
  });

  return doc;
}
