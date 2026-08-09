/**
 * Exact barcode plus common scanner/GTIN padding variants.
 *
 * Handheld scanners often emit EAN-13 with a leading 0 for UPC-A labels
 * stored as 12 digits (and the reverse). Keep in sync with
 * aimatic.barcode_utils.barcode_variants / price_check lookup.
 */
export function barcodeVariants(barcode: string | null | undefined): string[] {
  const value = String(barcode ?? "").trim();
  if (!value) return [];

  const variants = new Set<string>([value]);
  if (/^\d+$/.test(value)) {
    const stripped = value.replace(/^0+/, "") || "0";
    variants.add(stripped);
    if (value.startsWith("0") && value.length > 1) {
      variants.add(value.slice(1));
    } else {
      variants.add(`0${value}`);
    }
    for (const width of [12, 13, 14] as const) {
      variants.add(value.padStart(width, "0"));
      variants.add(stripped.padStart(width, "0"));
    }
  }
  return [...variants];
}
