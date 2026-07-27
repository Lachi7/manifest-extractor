# Railway Document Data Extraction - Gemini Vision Pipeline

(A Google Colab notebook)[https://colab.research.google.com/drive/1DFifNzRHTT3Pv8kvLrR14tx5a-_US-Z_?usp=sharing] that uses Google's Gemini vision-language model to extract structured data from scanned Russian-language railway shipping documents, converting messy scanned paperwork into clean, exportable spreadsheets (CSV/JSON).

Built at **ASCO CSJC** to replace the manual process of locating wagon numbers, container/waybill numbers, and ГНГ/QNQ codes across scanned PDF manifests and typing them into Excel by hand.

---

## Overview

Railway freight shipments generate several kinds of paper documents all typewritten or handwritten in cyrillic, often scanned at odd rotations and varying quality. This notebook automates reading them:

1. **Classify** each scanned page into one of four document types.
2. **Extract** structured fields from that page using a type-specific Gemini prompt and a Pydantic schema.
3. **Aggregate** results across all pages of a PDF into pandas DataFrames.
4. **Export** the results as CSV and JSON, and (optionally) **merge** cargo codes from single-wagon waybills back onto the main wagon summary table by wagon number.

---

## Document Types Handled

| Type | Description |
|---|---|
| `transfer_manifest_table` | Wide, dense table ("Передаточная ведомость" / "Передаточная поездная ведомость"), typewritten in dot-matrix font, one row per wagon, ~15 columns. May be scanned upright or rotated 90°. |
| `wagon_summary_table` | Upright ferry transfer summary table with header info (Паром / Откуда / Куда / Рейс №) above the table, and totals row at the bottom. |
| `single_wagon_waybill` | Single-shipment form ("Накладная СМГС", "Дорожная ведомость", or "Пересылочная накладная") with numbered boxes, describing one wagon. |
| `other` | Anything that doesn't match the above just skipped, no extraction call made. |

---

## Requirements

Installed automatically in the first cell:

- `google-genai` - official SDK for the Gemini API (multimodal calls, structured JSON output)
- `pdf2image` + `poppler-utils` - renders PDF pages to images
- `pypdf` - reads PDF page counts
- `pydantic` - defines and validates the structured output schemas
- `pandas` - tabular data handling and CSV export

You will also need a **Gemini API key**, entered securely via a hidden prompt (`getpass`) at runtime, it is never hard-coded or logged.

---

## Data Schemas (Pydantic)

| Schema | Purpose |
|---|---|
| `WagonRow` | One row of the 15-column transfer manifest (wagon type, series, wagon number, container number, owner code, origin/destination stations, cargo code/name, net/gross weight, loading date, remarks). |
| `ManifestHeader` | Top-level metadata for the transfer manifest (train number, totals, dates). |
| `SummaryHeader` / `WagonSummaryRow` | Header info and per-row fields for the ferry summary table (ferry name, ports, voyage number, wagon/waybill/container numbers, cargo, weights, payment fields). |
| `PageExtraction` | Router schema classifies the page, then populates only the fields relevant to that document type. |
| `PageClassification` | Lightweight schema used purely for the fast first-pass classification step. |
| `GNGWagonPair` | Two-field schema (wagon code + ГНГ/QNQ code) used for single-wagon waybill pages. |

All numeric/date fields are typed and optional where a field may legitimately be blank on the source document, so the model returns `null` rather than guessing.

---

## Key Design Choices

- **Two-stage classify-then-extract flow.** Classification runs with `thinking_budget = 0` since it's a simple categorical task; extraction runs with a larger thinking budget (2048 - 4096 tokens) since dense table reading benefits from more careful internal reasoning.
- **`temperature = 0.0`** throughout, for maximum determinism, the same scanned page should yield the same extraction every time.
- **Structured output via `response_schema`** (not free-text parsing) - Gemini returns JSON that is directly validated against the Pydantic models, eliminating brittle regex/text parsing of the model's response.
- **Detailed, column-by-column prompts.** The extraction prompts explicitly enumerate every column, warn about visually similar columns (e.g. wagon number vs. container number, both 8 digits), flag common dot-matrix OCR misreads (6/8, 1/7, 3/9, 0/8), and include sanity checks (e.g. gross weight must exceed net weight).
- **Retry with exponential backoff.** `call_with_retry()` wraps every API call and automatically retries on `429`/`RESOURCE_EXHAUSTED` errors with exponential backoff plus jitter, up to 6 attempts.
- **Selective page processing.** `page_spec` (e.g. `"1, 5, 12-14"`) lets you run the pipeline on a subset of pages instead of the whole PDF, useful for testing or reprocessing a single page.
- **Join key normalization.** Wagon codes extracted from waybills sometimes carry slash/space-suffixed series codes; a regex extracts just the leading digits as a clean `wagon_number` join key while preserving the raw value.

---

## Usage

1. Run the setup cells (installs, API key prompt, PDF upload).
2. Preview a page to confirm rotation is correct (`pdf_to_images` + `preview_page`).
3. Run the full manifest pipeline:
   ```python
   dfs = process_manifest(pdf_paths[0], rotation_angle = 90, page_spec = "1")
   dfs.get("wagon_summary")
   ```
4. For single-wagon waybill PDFs, run the ГНГ/wagon extraction pipeline:
   ```python
   results = extract_gng_wagon_list(pdf_paths[0], rotation_angle = 0)
   gng_df = gng_results_to_df(results)
   ```
5. Merge ГНГ codes onto the wagon summary table by wagon number:
   ```python
   merged_df = df.merge(gng_df[["wagon_number", "gng_code"]], on = "wagon_number", how = "left")
   ```

Outputs are saved under `manifest_output/` as:
- `<name>_transfer_manifest.csv` / `<name>_transfer_manifest_header.json`
- `<name>_wagon_summary.csv` / `<name>_wagon_summary_header.json`

---

## Confidentiality Note

Cell outputs throughout this notebook have been cleared before sharing, since the source documents contain confidential ASCO logistics data (cargo details, wagon numbers, station names, shipment values, etc.). The code and prompts are shared as-is; sample outputs are not included.

---

## Known Limitations

- Extraction quality depends on scan resolution and rotation accuracy, a mis-set `rotation_angle` will degrade results.
- The pipeline assumes each page belongs cleanly to one of the four defined types, multi-document or hybrid pages are not handled.
- Rate limiting is handled defensively, but very large PDFs will still incur one classification call and one extraction call per relevant page, which affects processing time and API cost accordingly.
