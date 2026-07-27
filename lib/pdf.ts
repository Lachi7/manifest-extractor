"use client";

import type { PDFDocumentProxy } from "pdfjs-dist";

let pdfjsLib: typeof import("pdfjs-dist") | null = null;

async function getPdfjs() {
  if (pdfjsLib) return pdfjsLib;
  const lib = await import("pdfjs-dist");
  // Worker is loaded from cdnjs (version-matched). This is the only external
  // asset the client fetches; everything else is bundled.
  lib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${lib.version}/pdf.worker.min.mjs`;
  pdfjsLib = lib;
  return lib;
}

export async function loadPdf(file: File): Promise<PDFDocumentProxy> {
  const lib = await getPdfjs();
  const data = await file.arrayBuffer();
  return lib.getDocument({ data }).promise;
}

export interface RenderOpts {
  /** If set, scale = dpi/72 — mirrors the notebook's convert_from_path(dpi=...). */
  dpi?: number;
  /** Otherwise, scale so the longest edge is this many px (used for the small preview). */
  longEdge?: number;
  format?: "png" | "jpeg";
  /** JPEG only. */
  quality?: number;
}

/**
 * Render one page to a data-URL.
 *
 * Rotation matches the notebook exactly: pdf.js renders the page respecting its
 * intrinsic /Rotate (same as poppler/pdf2image), then we add the user rotation.
 * The notebook rotates with PIL `rotate(angle, expand=True)`, which is
 * COUNTER-clockwise for positive angles; pdf.js viewport rotation is clockwise,
 * so we subtract to get the same visual result. `rotationCcw` therefore carries
 * the same meaning as the notebook's rotation_angle.
 */
export async function renderPage(
  doc: PDFDocumentProxy,
  pageNum: number,
  rotationCcw: number,
  opts: RenderOpts = {}
): Promise<string> {
  const page = await doc.getPage(pageNum);
  const intrinsic = page.rotate ?? 0;
  const total = (((intrinsic - rotationCcw) % 360) + 360) % 360;

  const v1 = page.getViewport({ scale: 1, rotation: total });
  const scale = opts.dpi ? opts.dpi / 72 : (opts.longEdge ?? 1500) / Math.max(v1.width, v1.height);
  const viewport = page.getViewport({ scale, rotation: total });

  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get canvas context");

  // White background so scanned pages stay legible.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({ canvasContext: ctx, viewport }).promise;

  const format = opts.format ?? "png";
  return format === "png" ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", opts.quality ?? 0.9);
}

/** Strip the `data:...;base64,` prefix to get the raw base64 payload. */
export function stripDataUrl(dataUrl: string): string {
  const comma = dataUrl.indexOf(",");
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}
