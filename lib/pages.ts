/**
 * Port of the notebook's parse_page_spec.
 * "1, 5, 12-14" -> [1, 5, 12, 13, 14]. Blank/undefined -> all pages.
 * Throws on out-of-range or unparseable input.
 */
export function parsePageSpec(spec: string, maxPages: number): number[] {
  const pages = new Set<number>();
  for (const partRaw of spec.split(",")) {
    const part = partRaw.trim();
    if (!part) continue;
    if (part.includes("-")) {
      const [sRaw, eRaw] = part.split("-");
      const start = parseInt(sRaw.trim(), 10);
      const end = parseInt(eRaw.trim(), 10);
      if (Number.isNaN(start) || Number.isNaN(end)) throw new Error(`Invalid range "${part}"`);
      for (let i = start; i <= end; i++) pages.add(i);
    } else {
      const n = parseInt(part, 10);
      if (Number.isNaN(n)) throw new Error(`Invalid page "${part}"`);
      pages.add(n);
    }
  }
  const sorted = [...pages].sort((a, b) => a - b);
  const invalid = sorted.filter((p) => p < 1 || p > maxPages);
  if (invalid.length) throw new Error(`Page(s) ${invalid.join(", ")} out of range — PDF has ${maxPages} page(s)`);
  return sorted;
}

export function allPages(maxPages: number): number[] {
  return Array.from({ length: maxPages }, (_, i) => i + 1);
}
