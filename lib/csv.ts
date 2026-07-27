/** Minimal CSV serializer that mirrors pandas to_csv(encoding="utf-8-sig"). */

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

export function toCsv<T extends Record<string, unknown>>(rows: T[], columns?: string[]): string {
  if (rows.length === 0) return "";
  const cols = columns ?? Object.keys(rows[0]);
  const header = cols.map(escapeCell).join(",");
  const body = rows.map((r) => cols.map((c) => escapeCell(r[c])).join(",")).join("\n");
  return header + "\n" + body;
}

export function downloadCsv(filename: string, csv: string) {
  // Prepend BOM so Excel reads Cyrillic correctly (utf-8-sig).
  download(filename, "﻿" + csv, "text/csv;charset=utf-8;");
}

/** Drop null/undefined keys — mirrors Pydantic model_dump_json(exclude_none=True). */
export function excludeNone<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== null && v !== undefined) out[k as keyof T] = v as T[keyof T];
  }
  return out;
}

export function downloadJson(filename: string, data: unknown) {
  download(filename, JSON.stringify(data, null, 2), "application/json;charset=utf-8;");
}

function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
