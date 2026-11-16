import type { ExtractedPdf, PdfLine, Progress } from "@/lib/types";

/* eslint-disable @typescript-eslint/no-explicit-any */
type PdfDoc = any;

let currentDoc: PdfDoc | null = null;
const pageImageCache = new Map<string, string>();
const MAX_CACHED_PAGES = 16;

async function loadPdfJs() {
  // pdf.js touches browser globals at import time, so load it lazily on the client.
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  return pdfjs;
}

const yieldToUi = () => new Promise<void>((r) => setTimeout(r, 0));

/**
 * Reads a PDF entirely in the browser. Pages are parsed one at a time and
 * released immediately, so memory stays flat even for very large books.
 */
export async function extractPdf(
  source: File | { url: string; name: string },
  onProgress: (p: Progress) => void,
): Promise<ExtractedPdf> {
  const pdfjs = await loadPdfJs();
  if (currentDoc) {
    try {
      await currentDoc.destroy();
    } catch {}
    currentDoc = null;
  }
  pageImageCache.clear();

  const isFile = source instanceof File;
  const task = pdfjs.getDocument(
    isFile ? { data: await source.arrayBuffer() } : { url: source.url },
  );
  const doc: PdfDoc = await task.promise;
  currentDoc = doc;

  const pageCount: number = doc.numPages;
  const lines: PdfLine[] = [];
  let chars = 0;

  for (let p = 1; p <= pageCount; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const pageLines = groupIntoLines(content.items, p);
    for (const l of pageLines) {
      lines.push(l);
      chars += l.text.length;
    }
    page.cleanup();
    if (p % 4 === 0 || p === pageCount) {
      onProgress({ stage: "reading", done: p, total: pageCount });
      await yieldToUi();
    }
  }

  if (chars < 200) {
    throw new Error(
      "This PDF doesn't contain selectable text (it looks scanned). Try a text-based PDF.",
    );
  }

  let title: string | undefined;
  try {
    const meta = await doc.getMetadata();
    const t = (meta?.info as any)?.Title;
    if (typeof t === "string" && t.trim().length > 3 && !/^(microsoft word|untitled)/i.test(t)) {
      title = t.trim();
    }
  } catch {}

  return {
    fileName: source.name,
    title,
    pageCount,
    lines,
    outline: await readOutline(doc),
  };
}

interface Frag {
  str: string;
  x: number;
  w: number;
  h: number;
}

const RTL_CHARS = /[֐-ࣿיִ-﷿ﹰ-ﻼ]/;
const LATIN = /[A-Za-z0-9]/;
const LIGATURES: Record<string, string> = { "ﬀ": "ff", "ﬁ": "fi", "ﬂ": "fl", "ﬃ": "ffi", "ﬄ": "ffl" };

function groupIntoLines(items: any[], page: number): PdfLine[] {
  const out: PdfLine[] = [];
  let frags: Frag[] = [];
  let lastY: number | null = null;
  let size = 0;

  const flush = () => {
    if (frags.length) {
      const text = lineText(frags).replace(/\s+/g, " ").trim();
      if (text) out.push({ text, size: Math.round(size * 2) / 2, page });
    }
    frags = [];
    size = 0;
    lastY = null;
  };

  for (const item of items) {
    if (typeof item.str !== "string") continue;
    const h = item.height || Math.abs(item.transform?.[3] ?? 0) || 10;
    const y = item.transform?.[5] ?? 0;
    if (lastY !== null && Math.abs(y - lastY) > Math.max(h, size) * 0.5) flush();
    if (item.str) {
      frags.push({ str: item.str, x: item.transform?.[4] ?? 0, w: item.width ?? 0, h });
      if (item.str.trim()) {
        size = Math.max(size, h);
        lastY = y;
      }
    }
    if (item.hasEOL) flush();
  }
  flush();
  return out;
}

/** Joins the text fragments of one line, inserting spaces where the layout shows a gap. */
function lineText(frags: Frag[]): string {
  if (!frags.some((f) => RTL_CHARS.test(f.str))) {
    let text = "";
    let endX = 0;
    for (const f of frags) {
      if (text && !/\s$/.test(text) && !/^\s/.test(f.str) && f.x - endX > f.h * 0.18) text += " ";
      text += f.str;
      endX = f.x + f.w;
    }
    return text.replace(/[ﬀ-ﬄ]/g, (c) => LIGATURES[c] ?? c);
  }

  // Right-to-left line. Many PDFs store Arabic as positioned glyph fragments in
  // visual order, so rebuild reading order from the x positions instead.
  const ltr = [...frags].filter((f) => f.str.trim()).sort((a, b) => a.x - b.x);

  // 1. Merge left-to-right islands (Latin words, numbers, their brackets) into single fragments.
  const merged: (Frag & { latin?: boolean })[] = [];
  let run: Frag[] = [];
  const closeRun = () => {
    if (!run.length) return;
    if (run.some((f) => LATIN.test(f.str))) {
      let text = "";
      let endX = 0;
      for (const f of run) {
        if (text && f.x - endX > f.h * 0.15) text += " ";
        text += f.str;
        endX = f.x + f.w;
      }
      // Sentence punctuation sits visually left of a Latin word but is read after it.
      text = text.replace(/^([.,:;!?،؛]+)\s*(.+)$/u, "$2$1");
      const last = run[run.length - 1];
      merged.push({ str: text, x: run[0].x, w: last.x + last.w - run[0].x, h: run[0].h, latin: true });
    } else {
      merged.push(...run);
    }
    run = [];
  };
  for (const f of ltr) {
    if (RTL_CHARS.test(f.str)) {
      closeRun();
      merged.push(f);
    } else {
      run.push(f);
    }
  }
  closeRun();

  // 2. Read right to left.
  merged.sort((a, b) => b.x + b.w - (a.x + a.w));
  let text = "";
  let prevLeft = Infinity;
  for (const f of merged) {
    const neutral = !f.latin && !RTL_CHARS.test(f.str.replace(/[ً-ْ]/g, ""));
    const piece = neutral ? [...f.str].reverse().join("") : f.str;
    if (text && prevLeft - (f.x + f.w) > f.h * 0.15) text += " ";
    text += piece;
    prevLeft = f.x;
  }
  return text.normalize("NFKC");
}

async function readOutline(doc: PdfDoc): Promise<{ title: string; page: number }[]> {
  try {
    let items: any[] | null = await doc.getOutline();
    if (!items?.length) return [];
    // A single root entry usually wraps the real chapter list.
    if (items.length === 1 && items[0].items?.length > 1) items = items[0].items;
    const out: { title: string; page: number }[] = [];
    for (const it of items!.slice(0, 200)) {
      try {
        const dest = typeof it.dest === "string" ? await doc.getDestination(it.dest) : it.dest;
        if (!dest?.[0]) continue;
        const idx = await doc.getPageIndex(dest[0]);
        const title = String(it.title ?? "").replace(/\s+/g, " ").trim();
        if (title) out.push({ title, page: idx + 1 });
      } catch {}
    }
    return out.sort((a, b) => a.page - b.page);
  } catch {
    return [];
  }
}

/** Renders one page of the loaded PDF to an image, on demand, with a small cache. */
export async function renderPageImage(pageNumber: number, width = 520): Promise<string | null> {
  const doc = currentDoc;
  if (!doc || pageNumber < 1 || pageNumber > doc.numPages) return null;
  const key = `${pageNumber}@${width}`;
  const hit = pageImageCache.get(key);
  if (hit) return hit;

  const page = await doc.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: width / base.width });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  await page.render({ canvas, viewport }).promise;
  const url = canvas.toDataURL("image/jpeg", 0.82);
  page.cleanup();

  if (pageImageCache.size >= MAX_CACHED_PAGES) {
    pageImageCache.delete(pageImageCache.keys().next().value as string);
  }
  pageImageCache.set(key, url);
  return url;
}
