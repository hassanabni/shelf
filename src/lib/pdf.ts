"use client";

import type { PDFDocumentProxy } from "pdfjs-dist";

let lib: typeof import("pdfjs-dist") | null = null;

export async function pdfjs() {
  if (!lib) {
    lib = await import("pdfjs-dist");
    lib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  }
  return lib;
}

export async function openPdf(data: ArrayBuffer): Promise<PDFDocumentProxy> {
  const p = await pdfjs();
  return p.getDocument({ data: new Uint8Array(data) }).promise;
}

/** Reads title + page count + a JPEG cover thumbnail from a PDF file. */
export async function inspectPdf(file: File) {
  const doc = await openPdf(await file.arrayBuffer());
  let title = file.name.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").trim();
  try {
    const meta = await doc.getMetadata();
    const t = (meta.info as { Title?: string })?.Title?.trim();
    if (t && t.length > 2 && !/^untitled|\.(docx?|pdf)$/i.test(t)) title = t;
  } catch {}
  let cover: string | undefined;
  try {
    const page = await doc.getPage(1);
    const vp1 = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale: 360 / vp1.width });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(vp.width);
    canvas.height = Math.floor(vp.height);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    cover = canvas.toDataURL("image/jpeg", 0.82);
  } catch {}
  const pages = doc.numPages;
  await doc.destroy();
  return { title, pages, cover };
}

export function formatBytes(n: number) {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function timeAgo(t?: number) {
  if (!t) return "Never opened";
  const s = (Date.now() - t) / 1000;
  if (s < 60) return "Just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  const d = Math.floor(s / 86400);
  if (d < 30) return `${d}d ago`;
  return new Date(t).toLocaleDateString();
}
