export type DocType =
  | "transfer_manifest_table"
  | "wagon_summary_table"
  | "single_wagon_waybill"
  | "other";

export interface WagonRow {
  row_no: number;
  wagon_type: string | null;
  wagon_series: string | null;
  wagon_number: string;
  container_transport_code: string | null;
  container_number: string | null;
  owner_code: string | null;
  origin_station: string | null;
  destination_station: string | null;
  cargo_code: string | null;
  cargo_name: string | null;
  net_weight_kg: number | null;
  gross_weight_kg: number | null;
  loading_date: string | null;
  carrier: string | null;
  gng_code?: string | null; // added by the merge step
}

export interface WagonSummaryRow {
  row_no: number;
  wagon_number: string;
  waybill_number: string;
  container_number: string | null;
  station_code: string | null;
  origin_station: string | null;
  destination_station: string | null;
  cargo_name: string | null;
  net_weight: number | null;
  gross_weight: number | null;
  ferry_payer: string | null;
  bridge_payer: string | null;
  gng_code?: string | null; // added by the merge step
}

export interface PageExtraction {
  document_type: "transfer_manifest_table" | "wagon_summary_table" | "other";
  manifest_header?: Record<string, unknown> | null;
  manifest_rows?: WagonRow[] | null;
  summary_header?: Record<string, unknown> | null;
  summary_rows?: WagonSummaryRow[] | null;
}

export interface GNGWagonPair {
  gng_code: string | null;
  wagon_code: string;
}

export interface GNGRow {
  wagon_number: string; // join key (leading digits)
  wagon_code_raw: string;
  gng_code: string | null;
}
