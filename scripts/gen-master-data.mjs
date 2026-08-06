/**
 * Regenerates lib/master-data.ts from the master_data spreadsheet exports.
 *
 * The notebook (GEMINI_API_VL_5) uploads master_data.xlsx and reads the
 * "Ports" and "Customers" sheets with header=None. The web app can't ask for
 * an upload on every visit, so the same two sheets are baked into the bundle
 * as CSV exports:
 *
 *   node scripts/gen-master-data.mjs "../master_data - Ports.csv" "../master_data - Customers.csv"
 *
 * Ports CSV columns:     port_id, name_az, name_ru, name_en   (no header row)
 * Customers CSV columns: customer_id, name                    (no header row)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const portsPath = resolve(here, process.argv[2] ?? "../../master_data - Ports.csv");
const customersPath = resolve(here, process.argv[3] ?? "../../master_data - Customers.csv");
const outPath = resolve(here, "../lib/master-data.ts");

/** Minimal RFC-4180 reader — enough for these two exports. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; }
        else quoted = false;
      } else cell += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}

const ports = parseCsv(readFileSync(portsPath, "utf8")).map(([id, az, ru, en]) => [
  Number(id), (az ?? "").trim(), (ru ?? "").trim(), (en ?? "").trim(),
]);
const customers = parseCsv(readFileSync(customersPath, "utf8")).map(([id, name]) => [
  Number(id), (name ?? "").trim(),
]);

const bad = [...ports, ...customers].filter((r) => !Number.isFinite(r[0]));
if (bad.length) throw new Error(`${bad.length} row(s) have a non-numeric id, e.g. ${JSON.stringify(bad[0])}`);

const body = `/* GENERATED FILE — do not edit by hand.
 * Source: master_data.xlsx ("Ports" / "Customers" sheets), exported to CSV.
 * Regenerate with: node scripts/gen-master-data.mjs
 *
 * Ports:     [port_id, name_az, name_ru, name_en]
 * Customers: [customer_id, name]
 */

export type PortRecord = [id: number, az: string, ru: string, en: string];
export type CustomerRecord = [id: number, name: string];

export const PORTS: PortRecord[] = ${JSON.stringify(ports)};

export const CUSTOMERS: CustomerRecord[] = ${JSON.stringify(customers)};
`;

writeFileSync(outPath, body, "utf8");
console.log(`wrote ${outPath}: ${ports.length} ports, ${customers.length} customers`);
