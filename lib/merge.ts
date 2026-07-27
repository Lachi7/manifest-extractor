import type { GNGWagonPair, GNGRow } from "./types";

/** Port of gng_results_to_df: derive the numeric join key from the raw wagon code. */
export function gngResultsToRows(results: GNGWagonPair[]): GNGRow[] {
  return results.map((pair) => {
    const raw = pair.wagon_code || "";
    const match = raw.match(/^\s*(\d+)/);
    const wagonNumber = match ? match[1] : raw;
    return { wagon_number: wagonNumber, wagon_code_raw: raw, gng_code: pair.gng_code };
  });
}

/**
 * Port of the pandas merge: left-join gng_code onto any table keyed by
 * wagon_number (string). First matching GNG row wins. Used for both the
 * wagon_summary and transfer_manifest tables.
 */
export function mergeGngByWagon<T extends { wagon_number: string }>(
  rows: T[],
  gngRows: GNGRow[]
): (T & { gng_code: string | null })[] {
  const byWagon = new Map<string, string | null>();
  for (const g of gngRows) {
    const key = String(g.wagon_number).trim();
    if (key && !byWagon.has(key)) byWagon.set(key, g.gng_code);
  }
  return rows.map((row) => {
    const key = String(row.wagon_number).trim();
    return { ...row, gng_code: byWagon.has(key) ? byWagon.get(key)! : null };
  });
}
