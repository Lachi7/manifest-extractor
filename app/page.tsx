"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import AnchorMark from "./anchor-mark";
import Landing from "./landing";
import { lockScroll, scrollToTop } from "./smooth-scroll";
import { loadPdf, renderPage, stripDataUrl } from "@/lib/pdf";
import { toCsv, downloadCsv, downloadJson, excludeNone } from "@/lib/csv";
import { gngResultsToRows, mergeGngByWagon } from "@/lib/merge";
import { parsePageSpec, allPages } from "@/lib/pages";
import {
  addReferenceIds,
  buildLookups,
  reorderWithIdsAdjacent,
  DEFAULT_SCORE_CUTOFF,
  MANIFEST_CUSTOMER_COLUMNS,
  MANIFEST_PORT_COLUMNS,
  SUMMARY_CUSTOMER_COLUMNS,
  SUMMARY_PORT_COLUMNS,
  type ReviewRow,
} from "@/lib/reference";
import type { DocType, GNGRow, GNGWagonPair, PageExtraction, WagonRow, WagonSummaryRow } from "@/lib/types";

const PREVIEW_LONG_EDGE = 900; // matches preview_page(max_width=900)

const MANIFEST_COLS: (keyof WagonRow)[] = [
  "row_no", "wagon_type", "wagon_series", "wagon_number", "container_transport_code",
  "container_number", "owner_code", "origin_station", "destination_station", "cargo_code",
  "cargo_name", "net_weight_kg", "gross_weight_kg", "loading_date", "carrier", "gng_code",
];
const SUMMARY_COLS: (keyof WagonSummaryRow)[] = [
  "row_no", "wagon_number", "waybill_number", "container_number", "station_code",
  "origin_station", "destination_station", "cargo_name", "net_weight", "gross_weight",
  "ferry_payer", "bridge_payer", "gng_code",
];
const GNG_COLS: (keyof GNGRow)[] = ["wagon_number", "wagon_code_raw", "gng_code"];
const REVIEW_COLS = ["table", "row", "column", "value", "matched_as", "score", "id"];

// add_reference_ids(...) column maps, per table, as called in the notebook.
const MANIFEST_ID_MAP = { ...MANIFEST_PORT_COLUMNS, ...MANIFEST_CUSTOMER_COLUMNS };
const SUMMARY_ID_MAP = { ...SUMMARY_PORT_COLUMNS, ...SUMMARY_CUSTOMER_COLUMNS };
const ID_COLS = [...new Set([...Object.values(MANIFEST_ID_MAP), ...Object.values(SUMMARY_ID_MAP)])];

/** Reference-ID modes: the notebook's 89% cutoff, a stricter one, or off. */
const MATCH_MODES = [
  { value: String(DEFAULT_SCORE_CUTOFF), label: `Fuzzy ${DEFAULT_SCORE_CUTOFF}% (notebook)` },
  { value: "95", label: "Fuzzy 95% (strict)" },
  { value: "100", label: "Exact names only" },
  { value: "off", label: "Off" },
];

async function callApi<T>(endpoint: string, imageBase64: string): Promise<T> {
  const res = await fetch(`/api/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: imageBase64 }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || `${endpoint} failed (${res.status})`);
  return data as T;
}

export default function Home() {
  const docRef = useRef<PDFDocumentProxy | null>(null);
  const fileUrlRef = useRef<string>("");

  const [fileName, setFileName] = useState<string>("");
  const [numPages, setNumPages] = useState(0);
  const [rotations, setRotations] = useState<number[]>([]);
  const [pageTypes, setPageTypes] = useState<{ page: number; type: DocType }[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [fileUrl, setFileUrl] = useState<string>("");
  const [zoom, setZoom] = useState<{ open: boolean; url: string; busy: boolean }>({ open: false, url: "", busy: false });
  const [dpi, setDpi] = useState(500); // notebook default: convert_from_path(dpi=500)
  const [pageSpec, setPageSpec] = useState("");
  // "auto" = classify each page (1 extra call/page). Choosing a known type
  // skips classification, halving the calls per page — handy under free-tier
  // quota when you already know what the pages are.
  const [docType, setDocType] = useState<"auto" | DocType>("auto");

  const [status, setStatus] = useState("Upload a scanned PDF to begin.");
  const [isError, setIsError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const [manifestRows, setManifestRows] = useState<WagonRow[]>([]);
  const [summaryRows, setSummaryRows] = useState<WagonSummaryRow[]>([]);
  const [gngRows, setGngRows] = useState<GNGRow[]>([]);
  const [manifestHeader, setManifestHeader] = useState<Record<string, unknown> | null>(null);
  const [summaryHeader, setSummaryHeader] = useState<Record<string, unknown> | null>(null);
  const [tab, setTab] = useState<"summary" | "manifest" | "gng" | "review">("summary");
  // Reference-ID matching against the bundled master data (Ports / Customers).
  const [matchMode, setMatchMode] = useState<string>(String(DEFAULT_SCORE_CUTOFF));

  function setErr(msg: string) {
    setStatus(msg);
    setIsError(true);
  }
  function setOk(msg: string) {
    setStatus(msg);
    setIsError(false);
  }

  async function drawPreview(pageNum: number, rot: number) {
    const doc = docRef.current;
    if (!doc) return;
    try {
      const url = await renderPage(doc, pageNum, rot, { longEdge: PREVIEW_LONG_EDGE, format: "jpeg", quality: 0.85 });
      setPreviewUrl(url);
    } catch (e) {
      setErr(`Preview failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) loadFile(file);
    e.target.value = ""; // allow re-selecting the same file
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) loadFile(file);
    else setErr("Please drop a PDF file.");
  }

  // Reset everything and return to the landing screen.
  function resetAll() {
    if (fileUrlRef.current) URL.revokeObjectURL(fileUrlRef.current);
    fileUrlRef.current = "";
    docRef.current = null;
    setFileName("");
    setNumPages(0);
    setRotations([]);
    setPageTypes([]);
    setManifestRows([]);
    setSummaryRows([]);
    setGngRows([]);
    setManifestHeader(null);
    setSummaryHeader(null);
    setPreviewUrl("");
    setFileUrl("");
    setProgress(null);
    setPageSpec("");
    setCurrentPage(1);
    setZoom({ open: false, url: "", busy: false });
    setOk("Upload a scanned PDF to begin.");
    scrollToTop(true); // the landing should open at the hero, not mid-page
  }

  async function loadFile(file: File) {
    setBusy(true);
    setOk("Loading PDF…");
    scrollToTop(true); // uploading from the closing CTA shouldn't land mid-workspace
    // reset results
    setManifestRows([]);
    setSummaryRows([]);
    setGngRows([]);
    setManifestHeader(null);
    setSummaryHeader(null);
    setPageTypes([]);
    setProgress(null);
    // Keep a blob URL of the original PDF so the user can open it in a new tab.
    if (fileUrlRef.current) URL.revokeObjectURL(fileUrlRef.current);
    const objUrl = URL.createObjectURL(file);
    fileUrlRef.current = objUrl;
    setFileUrl(objUrl);
    setZoom({ open: false, url: "", busy: false });

    try {
      const doc = await loadPdf(file);
      docRef.current = doc;
      setFileName(file.name);
      setNumPages(doc.numPages);
      const rots = new Array(doc.numPages).fill(0);
      setRotations(rots);
      setCurrentPage(1);
      await drawPreview(1, 0);
      setOk(`${doc.numPages} page(s) loaded. Rotate any sideways pages, then click Extract.`);
    } catch (err) {
      setErr(`Could not open PDF: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  async function gotoPage(n: number) {
    const clamped = Math.max(1, Math.min(n, numPages));
    setCurrentPage(clamped);
    await drawPreview(clamped, rotations[clamped - 1] ?? 0);
  }

  async function rotateCurrent(delta: number) {
    if (!numPages) return;
    const next = [...rotations];
    const idx = currentPage - 1;
    next[idx] = (((next[idx] + delta) % 360) + 360) % 360;
    setRotations(next);
    await drawPreview(currentPage, next[idx]);
  }

  async function rotateAll(deg: number) {
    if (!numPages) return;
    const next = new Array(numPages).fill(deg);
    setRotations(next);
    await drawPreview(currentPage, deg);
  }

  async function openZoom() {
    const doc = docRef.current;
    if (!doc) return;
    setZoom({ open: true, url: "", busy: true });
    try {
      // High-res render of the current page WITH its rotation — what Gemini sees.
      const url = await renderPage(doc, currentPage, rotations[currentPage - 1] ?? 0, {
        longEdge: 2600,
        format: "jpeg",
        quality: 0.92,
      });
      setZoom({ open: true, url, busy: false });
    } catch (e) {
      setZoom({ open: false, url: "", busy: false });
      setErr(`Enlarge failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  function closeZoom() {
    setZoom({ open: false, url: "", busy: false });
  }

  async function extractAll() {
    const doc = docRef.current;
    if (!doc) return;

    let pageList: number[];
    try {
      pageList = pageSpec.trim() ? parsePageSpec(pageSpec, numPages) : allPages(numPages);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      return;
    }
    if (pageList.length === 0) {
      setErr("No pages selected.");
      return;
    }

    setBusy(true);
    setIsError(false);
    setProgress({ done: 0, total: pageList.length });

    const manifest: WagonRow[] = [];
    const summary: WagonSummaryRow[] = [];
    const gngResults: GNGWagonPair[] = [];
    const types: { page: number; type: DocType }[] = [];
    const errors: string[] = [];
    const total = pageList.length;
    let mHeader: Record<string, unknown> | null = null;
    let sHeader: Record<string, unknown> | null = null;

    for (let idx = 0; idx < pageList.length; idx++) {
      const p = pageList[idx];
      const rot = rotations[p - 1] ?? 0;
      const label = `Page ${p} (${idx + 1}/${total})`;
      try {
        setOk(`${label}: rendering…`);
        // PNG at the notebook DPI — identical bytes to image.save(buf, "PNG").
        const dataUrl = await renderPage(doc, p, rot, { dpi, format: "png" });
        const b64 = stripDataUrl(dataUrl);

        let t: DocType;
        if (docType !== "auto") {
          t = docType; // user-specified type — skip the classify call entirely
        } else {
          setOk(`${label}: classifying…`);
          const cls = await callApi<{ document_type: DocType }>("classify", b64);
          t = cls.document_type;
        }
        types.push({ page: p, type: t });

        if (t === "transfer_manifest_table" || t === "wagon_summary_table") {
          setOk(`${label}: extracting ${t}…`);
          const ext = await callApi<PageExtraction>("extract", b64);
          if (ext.document_type === "transfer_manifest_table") {
            if (mHeader === null && ext.manifest_header) mHeader = ext.manifest_header;
            manifest.push(...(ext.manifest_rows ?? []));
          } else if (ext.document_type === "wagon_summary_table") {
            if (sHeader === null && ext.summary_header) sHeader = ext.summary_header;
            summary.push(...(ext.summary_rows ?? []));
          }
        } else if (t === "single_wagon_waybill") {
          setOk(`${label}: reading GNG / wagon…`);
          const g = await callApi<GNGWagonPair>("gng", b64);
          gngResults.push(g);
        }
        // "other" pages are skipped, matching the notebook.
      } catch (e) {
        errors.push(`page ${p}: ${e instanceof Error ? e.message : String(e)}`);
      }
      setProgress({ done: idx + 1, total });
    }

    const gng = gngResultsToRows(gngResults);

    // Store RAW rows; the merged views are derived (useMemo) so editing a GNG
    // wagon number instantly re-merges into both tables.
    setPageTypes(types);
    setManifestRows(manifest);
    setSummaryRows(summary);
    setGngRows(gng);
    setManifestHeader(mHeader);
    setSummaryHeader(sHeader);

    const parts: string[] = [];
    if (summary.length) parts.push(`wagon_summary: ${summary.length} row(s)`);
    if (manifest.length) parts.push(`transfer_manifest: ${manifest.length} row(s)`);
    if (gng.length) parts.push(`GNG/waybill: ${gng.length} form(s)`);
    if (summary.length) setTab("summary");
    else if (manifest.length) setTab("manifest");
    else if (gng.length) setTab("gng");

    let msg = parts.length ? `Done — ${parts.join(" | ")}.` : "Done — no table or waybill data found.";
    if (errors.length) msg += ` ${errors.length} page(s) errored.`;
    if (errors.length) setErr(msg + " " + errors.join("; "));
    else setOk(msg);
    setBusy(false);
  }

  const rot = rotations[currentPage - 1] ?? 0;
  const started = numPages > 0;

  // Freeze the smooth-scrolled page behind the enlarge modal, so the wheel
  // drives the high-res image instead of the document under it.
  useEffect(() => {
    lockScroll(zoom.open);
    return () => lockScroll(false);
  }, [zoom.open]);

  // Derived: gng_code merged into both tables. Recomputes whenever a GNG wagon
  // number is edited, so fixes flow straight into the tables and downloads.
  const mergedSummary = useMemo(() => mergeGngByWagon(summaryRows, gngRows), [summaryRows, gngRows]);
  const mergedManifest = useMemo(() => mergeGngByWagon(manifestRows, gngRows), [manifestRows, gngRows]);

  // The master lists are static — normalize and index them once per session.
  const lookups = useMemo(() => buildLookups(), []);
  const cutoff = matchMode === "off" ? null : Number(matchMode);

  // Derived: add_reference_ids() over each table. Runs entirely in the browser,
  // so changing the cutoff (or an edited GNG wagon number) re-matches instantly.
  const summaryWithIds = useMemo(
    () =>
      cutoff === null
        ? { rows: mergedSummary as unknown as Record<string, unknown>[], review: [] as ReviewRow[] }
        : addReferenceIds(mergedSummary as unknown as Record<string, unknown>[], {
            portColumns: SUMMARY_PORT_COLUMNS,
            customerColumns: SUMMARY_CUSTOMER_COLUMNS,
            lookups,
            scoreCutoff: cutoff,
          }),
    [mergedSummary, lookups, cutoff]
  );
  const manifestWithIds = useMemo(
    () =>
      cutoff === null
        ? { rows: mergedManifest as unknown as Record<string, unknown>[], review: [] as ReviewRow[] }
        : addReferenceIds(mergedManifest as unknown as Record<string, unknown>[], {
            portColumns: MANIFEST_PORT_COLUMNS,
            customerColumns: MANIFEST_CUSTOMER_COLUMNS,
            lookups,
            scoreCutoff: cutoff,
          }),
    [mergedManifest, lookups, cutoff]
  );

  const summaryCols = useMemo(
    () => (cutoff === null ? SUMMARY_COLS : reorderWithIdsAdjacent(SUMMARY_COLS as string[], SUMMARY_ID_MAP)),
    [cutoff]
  ) as string[];
  const manifestCols = useMemo(
    () => (cutoff === null ? MANIFEST_COLS : reorderWithIdsAdjacent(MANIFEST_COLS as string[], MANIFEST_ID_MAP)),
    [cutoff]
  ) as string[];

  // Every value that matched below 100% (or not at all), worst first — the
  // notebook's low-confidence report, as a tab.
  const reviewRows = useMemo(
    () =>
      [
        ...summaryWithIds.review.map((r) => ({ ...r, table: "wagon_summary" })),
        ...manifestWithIds.review.map((r) => ({ ...r, table: "transfer_manifest" })),
      ].sort((a, b) => a.score - b.score),
    [summaryWithIds, manifestWithIds]
  );
  const unmatchedCount = reviewRows.filter((r) => r.id === null).length;

  // `${rowIndex}:${column}` → match note, so a fuzzy or failed match can be
  // flagged on the cell it came from.
  const summaryNotes = useMemo(() => noteMap(summaryWithIds.review), [summaryWithIds]);
  const manifestNotes = useMemo(() => noteMap(manifestWithIds.review), [manifestWithIds]);

  function updateGngWagon(index: number, value: string) {
    setGngRows((prev) => prev.map((r, i) => (i === index ? { ...r, wagon_number: value } : r)));
  }

  return (
    <div className={`container ${started ? "workspace" : "is-landing"}`}>
      {!started && (
        <Landing busy={busy} status={status} isError={isError} onDrop={onDrop} onFileInput={handleFileInput} />
      )}

      {started && (
        <>
          <header className="app-header compact">
            <div className="brand-row">
              <AnchorMark size={30} tone="light" />
              <div className="app-header-text">
                <h1>Railway Manifest Extractor</h1>
                <div className="file-name">{fileName}</div>
              </div>
            </div>
            <button className="ghost-btn" onClick={resetAll} disabled={busy}>
              ↑ New file
            </button>
          </header>

          <div className="panel">
        <div className="controls">
          <div className="field">
            <label>PDF file</label>
            <input type="file" accept="application/pdf" onChange={handleFileInput} disabled={busy} />
          </div>
          <div className="field">
            <label>Pages (blank = all)</label>
            <input
              type="text"
              className="text-input"
              placeholder="e.g. 1, 3-5"
              value={pageSpec}
              onChange={(e) => setPageSpec(e.target.value)}
              disabled={busy || !numPages}
              style={{ width: 130 }}
            />
          </div>
          <div className="field">
            <label>Page type</label>
            <select value={docType} onChange={(e) => setDocType(e.target.value as "auto" | DocType)} disabled={busy}>
              <option value="auto">Auto-detect</option>
              <option value="transfer_manifest_table">Transfer manifest</option>
              <option value="wagon_summary_table">Wagon summary</option>
              <option value="single_wagon_waybill">Single-wagon waybill</option>
            </select>
          </div>
          <div className="field">
            <label>Render DPI</label>
            <select value={dpi} onChange={(e) => setDpi(Number(e.target.value))} disabled={busy}>
              <option value={300}>300 (lighter)</option>
              <option value={400}>400</option>
              <option value={500}>500 (notebook)</option>
            </select>
          </div>
          <div className="field">
            <label>Reference IDs</label>
            <select value={matchMode} onChange={(e) => setMatchMode(e.target.value)} disabled={busy}>
              {MATCH_MODES.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Rotate all pages</label>
            <select
              value=""
              onChange={(e) => e.target.value !== "" && rotateAll(Number(e.target.value))}
              disabled={busy || !numPages}
            >
              <option value="">— choose —</option>
              <option value={0}>0°</option>
              <option value={90}>90°</option>
              <option value={-90}>−90°</option>
              <option value={180}>180°</option>
            </select>
          </div>
          <div className="field">
            <label>&nbsp;</label>
            <button className="primary" onClick={extractAll} disabled={busy || !numPages}>
              {busy ? "Working…" : "Extract"}
            </button>
          </div>
        </div>

        <div className={`status ${isError ? "error" : ""}`}>{status}</div>
        {progress && (
          <div className="progress-track">
            <div className="progress-bar" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
          </div>
        )}
      </div>

          <div className="grid">
          <div className="panel preview-wrap">
            <div className="page-nav">
              <button onClick={() => gotoPage(currentPage - 1)} disabled={busy || currentPage <= 1}>
                ‹ Prev
              </button>
              <span className="hint">
                Page {currentPage} / {numPages} · rot {rot}°
              </span>
              <button onClick={() => gotoPage(currentPage + 1)} disabled={busy || currentPage >= numPages}>
                Next ›
              </button>
            </div>
            <div className="preview-controls">
              <button onClick={() => rotateCurrent(90)} disabled={busy}>
                ⟲ Rotate
              </button>
              <button onClick={() => rotateCurrent(-90)} disabled={busy}>
                ⟳ Rotate
              </button>
              <button onClick={openZoom} disabled={!numPages}>
                🔍 Enlarge
              </button>
              {fileUrl && (
                <a className="btn-link" href={fileUrl} target="_blank" rel="noopener noreferrer">
                  Open PDF ↗
                </a>
              )}
            </div>
            {previewUrl && (
              <img
                className="preview-img preview-clickable"
                src={previewUrl}
                alt={`Page ${currentPage}`}
                onClick={openZoom}
                title="Click to enlarge"
              />
            )}
            {pageTypes.length > 0 && (
              <div className="chips">
                {pageTypes.map(({ page, type }) => (
                  <span className="chip" key={page}>
                    p{page}: {type.replace(/_/g, " ")}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="panel">
            <div className="tabs">
              <button className={`tab ${tab === "summary" ? "active" : ""}`} onClick={() => setTab("summary")}>
                Wagon summary {summaryRows.length ? `(${summaryRows.length})` : ""}
              </button>
              <button className={`tab ${tab === "manifest" ? "active" : ""}`} onClick={() => setTab("manifest")}>
                Transfer manifest {manifestRows.length ? `(${manifestRows.length})` : ""}
              </button>
              <button className={`tab ${tab === "gng" ? "active" : ""}`} onClick={() => setTab("gng")}>
                GNG / waybills {gngRows.length ? `(${gngRows.length})` : ""}
              </button>
              <button className={`tab ${tab === "review" ? "active" : ""}`} onClick={() => setTab("review")}>
                Match review {reviewRows.length ? `(${reviewRows.length})` : ""}
              </button>
            </div>

            {tab === "summary" && (
              <TableView
                rows={summaryWithIds.rows}
                columns={summaryCols}
                numeric={["row_no", "net_weight", "gross_weight", ...ID_COLS]}
                base={baseName(fileName)}
                slug="wagon_summary"
                header={summaryHeader}
                notes={summaryNotes}
                emptyHint="Run Extract to populate the wagon summary table."
              />
            )}
            {tab === "manifest" && (
              <TableView
                rows={manifestWithIds.rows}
                columns={manifestCols}
                numeric={["row_no", "net_weight_kg", "gross_weight_kg", ...ID_COLS]}
                base={baseName(fileName)}
                slug="transfer_manifest"
                header={manifestHeader}
                notes={manifestNotes}
                emptyHint="Run Extract to populate the transfer manifest table."
              />
            )}
            {tab === "gng" && (
              <GngTableView rows={gngRows} onWagonChange={updateGngWagon} base={baseName(fileName)} />
            )}
            {tab === "review" && (
              <ReviewView
                rows={reviewRows}
                unmatched={unmatchedCount}
                cutoff={cutoff}
                base={baseName(fileName)}
                hasData={mergedSummary.length + mergedManifest.length > 0}
                masterCounts={{ ports: lookups.portCount, customers: lookups.customerCount }}
              />
            )}
          </div>
          </div>
        </>
      )}

      {zoom.open && (
        <div className="modal-overlay" onClick={closeZoom}>
          <div className="modal-body" onClick={(e) => e.stopPropagation()}>
            <div className="modal-bar">
              <span className="hint">
                Page {currentPage} / {numPages} · rot {rot}° · scroll to inspect
              </span>
              <div className="btn-row">
                {fileUrl && (
                  <a className="btn-link" href={fileUrl} target="_blank" rel="noopener noreferrer">
                    Open PDF ↗
                  </a>
                )}
                <button onClick={closeZoom}>✕ Close</button>
              </div>
            </div>
            <div className="modal-scroll" data-lenis-prevent>
              {zoom.busy ? (
                <p className="hint" style={{ padding: 16 }}>
                  Rendering high-res page…
                </p>
              ) : (
                zoom.url && <img className="modal-img" src={zoom.url} alt={`Page ${currentPage}`} />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function baseName(name: string): string {
  return name.replace(/\.pdf$/i, "") || "manifest";
}

/** Index the below-100 matches by the cell they came from. */
function noteMap(review: ReviewRow[]): Map<string, ReviewRow> {
  const map = new Map<string, ReviewRow>();
  for (const r of review) map.set(`${r.rowIndex}:${r.column}`, r);
  return map;
}

function TableView({
  rows,
  columns,
  numeric,
  base,
  slug,
  header,
  notes,
  emptyHint,
}: {
  rows: Record<string, unknown>[];
  columns: string[];
  numeric: string[];
  base: string;
  slug: string;
  header?: Record<string, unknown> | null;
  notes?: Map<string, ReviewRow>;
  emptyHint: string;
}) {
  const cleanHeader = header ? excludeNone(header) : null;
  const hasHeader = cleanHeader && Object.keys(cleanHeader).length > 0;

  // Full JSON = header (if any) + every row.
  const fullJson = hasHeader ? { header: cleanHeader, rows } : rows;

  if (rows.length === 0) return <p className="hint">{emptyHint}</p>;
  const numSet = new Set(numeric);
  return (
    <div>
      <div className="table-toolbar">
        <span className="count-pill">{rows.length} row(s)</span>
        <div className="btn-row">
          <button onClick={() => downloadCsv(`${base}_${slug}.csv`, toCsv(rows, columns))}>Download CSV</button>
          <button onClick={() => downloadJson(`${base}_${slug}.json`, fullJson)}>Download JSON</button>
        </div>
      </div>
      <div className="table-scroll" data-lenis-prevent>
        <table>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {columns.map((c) => {
                  const v = r[c];
                  const empty = v === null || v === undefined || v === "";
                  // A source column whose name matched fuzzily (or not at all)
                  // is flagged, with the matched master name in the tooltip.
                  const note = notes?.get(`${i}:${c}`);
                  const cls = [
                    numSet.has(c) ? "num" : "",
                    note ? (note.id === null ? "cell-unmatched" : "cell-fuzzy") : "",
                  ]
                    .filter(Boolean)
                    .join(" ");
                  const title = note
                    ? note.id === null
                      ? "No master-data match — id left empty"
                      : `Matched "${note.matchedAs}" → id ${note.id} (${note.score.toFixed(0)}%)`
                    : undefined;
                  return (
                    <td key={c} className={cls} title={title}>
                      {empty ? <span className="empty-cell">—</span> : String(v)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Match review ──────────────────────────────────────────────────────
   The notebook prints every value that matched below 100% as a DataFrame
   before you trust the ID columns; this is the same list, worst score first. */
function ReviewView({
  rows,
  unmatched,
  cutoff,
  base,
  hasData,
  masterCounts,
}: {
  rows: (ReviewRow & { table: string })[];
  unmatched: number;
  cutoff: number | null;
  base: string;
  hasData: boolean;
  masterCounts: { ports: number; customers: number };
}) {
  if (cutoff === null)
    return (
      <p className="hint">
        Reference-ID matching is off. Pick a cutoff under <strong>Reference IDs</strong> to add
        port and customer IDs to the tables.
      </p>
    );
  if (!hasData) return <p className="hint">Run Extract to match station and payer names against the master data.</p>;
  if (rows.length === 0)
    return (
      <p className="hint">
        Every station, carrier and payer name matched the master data exactly — nothing to review.
      </p>
    );

  const csvRows = rows.map((r) => ({
    table: r.table,
    row: r.rowIndex + 1,
    column: r.column,
    value: r.value ?? "",
    matched_as: r.matchedAs ?? "",
    score: r.score ? r.score.toFixed(1) : "",
    id: r.id ?? "",
  }));

  return (
    <div>
      <p className="hint" style={{ marginTop: 0 }}>
        {rows.length} value(s) matched below 100% at a {cutoff}% cutoff, {unmatched} with no match at all. Master
        data: {masterCounts.ports} ports, {masterCounts.customers} customers.
      </p>
      <div className="table-toolbar">
        <span className="count-pill">{rows.length} value(s)</span>
        <div className="btn-row">
          <button onClick={() => downloadCsv(`${base}_match_review.csv`, toCsv(csvRows, REVIEW_COLS))}>
            Download CSV
          </button>
        </div>
      </div>
      <div className="table-scroll" data-lenis-prevent>
        <table>
          <thead>
            <tr>
              <th>table</th>
              <th>row</th>
              <th>column</th>
              <th>value</th>
              <th>matched_as</th>
              <th>score</th>
              <th>id</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className={r.id === null ? "row-unmatched" : ""}>
                <td>{r.table}</td>
                <td className="num">{r.rowIndex + 1}</td>
                <td>{r.column}</td>
                <td>{r.value ? String(r.value) : <span className="empty-cell">—</span>}</td>
                <td>{r.matchedAs ?? <span className="empty-cell">no match</span>}</td>
                <td className="num">{r.score ? r.score.toFixed(1) : <span className="empty-cell">—</span>}</td>
                <td className="num">{r.id ?? <span className="empty-cell">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GngTableView({
  rows,
  onWagonChange,
  base,
}: {
  rows: GNGRow[];
  onWagonChange: (index: number, value: string) => void;
  base: string;
}) {
  if (rows.length === 0)
    return <p className="hint">Single-wagon waybill pages (СМГС / Пересылочная накладная) will appear here.</p>;
  return (
    <div>
      <p className="hint" style={{ marginTop: 0 }}>
        Edit <strong>wagon_number</strong> (the join key) to fix a mis-read or multi-wagon waybill — it re-merges into
        the summary and manifest tables instantly.
      </p>
      <div className="table-toolbar">
        <span className="count-pill">{rows.length} form(s)</span>
        <div className="btn-row">
          <button onClick={() => downloadCsv(`${base}_gng_wagon.csv`, toCsv(rows as unknown as Record<string, unknown>[], GNG_COLS as string[]))}>
            Download CSV
          </button>
          <button onClick={() => downloadJson(`${base}_gng_wagon.json`, rows)}>Download JSON</button>
        </div>
      </div>
      <div className="table-scroll" data-lenis-prevent>
        <table>
          <thead>
            <tr>
              <th>wagon_number (editable)</th>
              <th>wagon_code_raw</th>
              <th>gng_code</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>
                  <input
                    className="cell-input"
                    value={r.wagon_number}
                    onChange={(e) => onWagonChange(i, e.target.value)}
                    spellCheck={false}
                  />
                </td>
                <td>{r.wagon_code_raw || <span className="empty-cell">—</span>}</td>
                <td>{r.gng_code ?? <span className="empty-cell">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
