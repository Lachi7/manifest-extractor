import { Type, type Schema } from "@google/genai";

/**
 * Response schemas + prompts, ported 1:1 from the GEMINI_API_VL_5 notebook.
 * The Pydantic models become Gemini `responseSchema` objects; field
 * descriptions are preserved because the model relies on them heavily.
 */

// ---------- transfer_manifest_table (AK HESEN style) ----------

const WagonRow: Schema = {
  type: Type.OBJECT,
  propertyOrdering: [
    "row_no",
    "wagon_type",
    "wagon_series",
    "wagon_number",
    "container_transport_code",
    "container_number",
    "owner_code",
    "origin_station",
    "destination_station",
    "cargo_code",
    "cargo_name",
    "net_weight_kg",
    "gross_weight_kg",
    "loading_date",
    "carrier",
  ],
  properties: {
    row_no: { type: Type.INTEGER },
    wagon_type: { type: Type.STRING, nullable: true, description: "Column 2: wagon type code, e.g. ВГ, БГ" },
    wagon_series: { type: Type.STRING, nullable: true, description: "Column 3: series code, e.g. 20, 29, 66" },
    wagon_number: { type: Type.STRING, description: "Column 4: full wagon number, 8 digits" },
    container_transport_code: {
      type: Type.STRING,
      nullable: true,
      description: "Column 5 (т/р кон): container transport code, usually blank on this document type, leave null if empty",
    },
    container_number: {
      type: Type.STRING,
      nullable: true,
      description:
        "Column 6: the container/waybill (накладной) number, an 8-digit number distinct from the wagon number, e.g. 44455566. This column is directly to the right of column 5 and almost always has a value.",
    },
    owner_code: { type: Type.STRING, nullable: true, description: "Column 7 (стр отп): 2-letter code, e.g. UZ" },
    origin_station: { type: Type.STRING, nullable: true, description: "Column 8: Станция отправления" },
    destination_station: { type: Type.STRING, nullable: true, description: "Column 9: Станция назначения" },
    cargo_code: {
      type: Type.STRING,
      nullable: true,
      description:
        "Column 10 (стр нзн): a short 2-letter code such as GE, positioned between the destination station column and the cargo name column. This is a real, usually-populated column, do not skip it or return null unless the cell is genuinely empty.",
    },
    cargo_name: { type: Type.STRING, nullable: true, description: "Column 11: Наименование груза" },
    net_weight_kg: { type: Type.INTEGER, nullable: true, description: "Column 12: Вес гр.кг - net weight, the smaller of the two weight values" },
    gross_weight_kg: { type: Type.INTEGER, nullable: true, description: "Column 13: Брутто кг - gross weight, the larger of the two weight values" },
    loading_date: { type: Type.STRING, nullable: true, description: "Column 14: Дата погрузки" },
    carrier: { type: Type.STRING, nullable: true, description: "Column 15: Примечание — carrier name, e.g. ADY EXPRESS" },
  },
  required: ["row_no", "wagon_number"],
};

const ManifestHeader: Schema = {
  type: Type.OBJECT,
  nullable: true,
  properties: {
    manifest_number: { type: Type.STRING, nullable: true },
    handover_station: { type: Type.STRING, nullable: true, description: "Станция сдачи" },
    receiving_station: { type: Type.STRING, nullable: true, description: "Станция приема" },
    handover_point: { type: Type.STRING, nullable: true, description: "Передаточная станция" },
    train_number: { type: Type.STRING, nullable: true },
    ferry_name: { type: Type.STRING, nullable: true },
    total_wagons: { type: Type.INTEGER, nullable: true },
    total_gross_weight_tons: { type: Type.STRING, nullable: true },
    total_net_weight_tons: { type: Type.STRING, nullable: true },
    total_axles: { type: Type.INTEGER, nullable: true },
    handover_date: { type: Type.STRING, nullable: true },
    handover_time: { type: Type.STRING, nullable: true },
  },
};

// ---------- wagon_summary_table (SHAHDAGH style) ----------

const SummaryHeader: Schema = {
  type: Type.OBJECT,
  nullable: true,
  properties: {
    ferry_name: { type: Type.STRING, nullable: true, description: "Паром, e.g. Şahdağ" },
    origin_port: { type: Type.STRING, nullable: true, description: "Откуда" },
    destination_port: { type: Type.STRING, nullable: true, description: "Куда" },
    voyage_number: { type: Type.STRING, nullable: true, description: "Рейс №" },
    voyage_date: { type: Type.STRING, nullable: true },
    signatory: { type: Type.STRING, nullable: true },
  },
};

const WagonSummaryRow: Schema = {
  type: Type.OBJECT,
  propertyOrdering: [
    "row_no",
    "wagon_number",
    "waybill_number",
    "container_number",
    "station_code",
    "origin_station",
    "destination_station",
    "cargo_name",
    "net_weight",
    "gross_weight",
    "ferry_payer",
    "bridge_payer",
  ],
  properties: {
    row_no: { type: Type.INTEGER },
    wagon_number: { type: Type.STRING, description: "№ Вагонов column" },
    waybill_number: { type: Type.STRING, description: "№ Накладных column" },
    container_number: { type: Type.STRING, nullable: true, description: "№ Контейнеров, handwritten, e.g. '17'" },
    station_code: { type: Type.STRING, nullable: true, description: "Код Стр, e.g. 20, 26, 57" },
    origin_station: { type: Type.STRING, nullable: true, description: "Станция Отправления column" },
    destination_station: { type: Type.STRING, nullable: true, description: "Станция Назначения column" },
    cargo_name: { type: Type.STRING, nullable: true, description: "Наименование Груза column" },
    net_weight: { type: Type.NUMBER, nullable: true, description: "Вес Нетто column, e.g. 66.983" },
    gross_weight: { type: Type.NUMBER, nullable: true, description: "Вес Брутто column, e.g. 92.983, must be larger than net_weight" },
    ferry_payer: { type: Type.STRING, nullable: true, description: "За Паром" },
    bridge_payer: { type: Type.STRING, nullable: true, description: "За Мост" },
  },
  required: ["row_no", "wagon_number", "waybill_number"],
};

// ---------- Router schema (fills only the matching branch) ----------

export const PageExtractionSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    document_type: {
      type: Type.STRING,
      enum: ["transfer_manifest_table", "wagon_summary_table", "other"],
      description: "Classify this page FIRST, then fill only the matching field(s) below. Leave the rest null/empty.",
    },
    manifest_header: ManifestHeader,
    manifest_rows: { type: Type.ARRAY, nullable: true, items: WagonRow },
    summary_header: SummaryHeader,
    summary_rows: { type: Type.ARRAY, nullable: true, items: WagonSummaryRow },
  },
  required: ["document_type"],
};

// ---------- Classification schema ----------

export const PageClassificationSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    document_type: {
      type: Type.STRING,
      enum: ["transfer_manifest_table", "wagon_summary_table", "single_wagon_waybill", "other"],
    },
  },
  required: ["document_type"],
};

// ---------- GNG / wagon pair schema ----------

export const GNGWagonPairSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    gng_code: {
      type: Type.STRING,
      nullable: true,
      description:
        "The ГНГ code, found inside box '15 Наименование груза', printed as 'ГНГ' or 'ГНГ:' followed by a number (e.g. 'ГНГ 99220000'). Extract ONLY the digits, not the 'ГНГ' label. Some pages (e.g. a Пересылочная накладная 'on perevozku porozhnego vagona' form) have no box 15 at all and no ГНГ code - if genuinely absent anywhere on the page, return null. Do not invent one.",
    },
    wagon_code: {
      type: Type.STRING,
      description:
        "The wagon number from box '7 Вагон' (Накладная СМГС forms) or box '1. Вагон' (Пересылочная накладная forms). Often handwritten in blue ink over a printed box. May be followed by a slash and a 2-digit series code (e.g. '11111111/11') or a space and series code (e.g. '22222222 22') - capture the FULL value including anything after the slash or space.",
    },
  },
  required: ["wagon_code"],
};

// ======================= PROMPTS (verbatim) =======================

export const EXTRACT_PROMPT = `You will see a scanned page(-s) from a railway shipping document. Classify it as exactly one of:

TYPE "transfer_manifest_table": A wide table titled "Передаточная ведомость" or "Передаточная
поездная ведомость", typewritten in a dot-matrix font, Cyrillic, one row per wagon. It may be
upright or rotated 90 degrees depending on how it was scanned. This table is dense and easy to
misread — read it carefully and methodically using the column-by-column approach described below,
not just a quick left-to-right pass per row.

Columns, left to right, exactly in this order. Column header text is sometimes printed (use it to
confirm alignment) and sometimes missing for a given column — rely on position (1st column after
the axle code, etc.) when a header is absent, not on header text alone:

The table has these columns, left to right, exactly in this order:
1. № п/п — row number
2. вг/кт — wagon type (ВГ, БГ)
3. ад/вк — series code (20, 29, 66...)
4. Номер ваг. — wagon number, 8 digits
5. т/р кон — container transport code, usually BLANK — do not confuse with column 6
6. (unlabeled 8-digit number) — the real container/waybill number, e.g. 50025591, 30078451 —
   this column is almost always populated, immediately right of column 5
7. стр — 2-letter owner code, e.g. UZ
8. Станция отправления — origin station
9. Станция назначения — destination station
10. стр (нзн) — a short 2-letter code such as GE — narrow column between destination station
    and cargo name, easy to visually skip but almost always populated. Look for it specifically.
11. Наименование груза — cargo name
12. Вес гр.кг — net weight (smaller number)
13. Брутто кг — gross weight (larger number)
14. Дата погрузки — loading date
15. Примечание — carrier/remarks

Instructions:
- Read every row exactly as printed. Row numbers usually run from 1 to N or N down to 1.
- Columns 4 and 6 are both 8-digit numbers but are DIFFERENT values (wagon number vs. container
  number) — do not merge or duplicate them, and do not skip column 6 even though it has no header text.
  Plus, Column 6 also can be 6-8 digit numbers, not only 8-digit ones.
- Column 10 is a narrow 2-letter column — actively check for it on every row rather than defaulting
  to null.
- Re-check digit-heavy fields (columns 4, 6, 12, 13) against common dot-matrix misreads: 6/8, 1/7, 3/9, 0/8.
- Column 13 (gross) must be larger than column 12 (net) for a loaded wagon — if reversed, re-check
  which column you read.
- Extract header/summary fields from the top and bottom of the document.
- Do not translate station or cargo names — keep original Cyrillic.
- Every row must appear in the output even if some fields are genuinely blank (use null),
  but do not use null for columns that actually have a printed value.

TYPE "wagon_summary_table": An upright table titled "Передаточная Ведомость" with header info
(Паром/ferry name, Откуда/Куда ports, Рейс №, date) ABOVE the table, and columns:
№ пп, № Вагонов, № Накладных, № Контейнеров (handwritten), Код Стр, Станция Отправления,
Станция Назначения, Наименование Груза, Вес (Нетто, Брутто), Оплата (За Паром, За Мост).
Has a ВСЕГО ВАГОНОВ totals row and a handwritten signatory name at the bottom.
This table's standard layout does NOT include wagon type, series code, owner code, cargo code,
loading date, or carrier name as separate columns — leave those fields null for this type unless
one of them is genuinely present as an extra column on this specific page.

TYPE "other": Anything that isn't one of the two table types above — for example a single-wagon
waybill form (Накладная СМГС, Дорожная ведомость, Пересылочная накладная). This function is now
normally only called on pages already pre-classified as a table type, so "other" should be rare —
but if the page clearly doesn't match either table type, classify it as "other" and leave the
table-specific fields null rather than forcing a bad match.
`;

export const CLASSIFY_PROMPT = `Classify this page as exactly one type:
- "transfer_manifest_table": wide rotated table, one row per wagon, ~15 columns, dot-matrix font
- "wagon_summary_table": upright summary table with Паром/Откуда/Куда/Рейс № header above the table
- "single_wagon_waybill": a single-shipment form (СМГС накладная, Дорожная ведомость, or Пересылочная
  накладная) with numbered boxes, describing ONE wagon
- "other": anything else
Just classify. Do not extract any data.`;

export const GNG_WAGON_PROMPT = `This page is a single-wagon railway waybill — either a "Накладная СМГС" form
(numbered boxes 1-29) or a "Пересылочная накладная" form (На перевозку порожнего вагона).

Extract exactly two values from this page:
1. Вагон (wagon) code — box "7 Вагон" on СМГС forms, or box "1. Вагон" on Пересылочная накладная
   forms. Read handwritten/stamped digits carefully. Capture everything in that box, including any
   slash-suffix or space-suffix series code.
2. ГНГ code — box "15 Наименование груза" on СМГС forms only, printed as "ГНГ" or "ГНГ:" followed
   by digits. If this page has no box 15 or no ГНГ label anywhere, return null — do not guess.

Re-check digits against common misreads: 6/8, 1/7, 3/9, 0/8.`;
