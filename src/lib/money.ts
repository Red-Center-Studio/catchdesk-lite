/**
 * Quote maths. Everything is whole cents, so totals add up exactly. Quantities are hundredths (150 = 1.5).
 * Plain TypeScript with no imports, so the same rules run on the server, in tests and in the seed script.
 */

export interface PricedItem {
  qtyHundredths: number;
  unitCents: number;
}

export interface TaxRules {
  /** Basis points: 1000 = 10%. */
  taxRateBp: number;
  /** True when item prices already include tax (common for GST and VAT). */
  pricesIncludeTax: boolean;
}

export interface Totals {
  /** Sum of the lines, as entered. */
  itemsCents: number;
  /** Total before tax. */
  netCents: number;
  taxCents: number;
  /** What the customer pays. */
  totalCents: number;
}

/** One line's amount, rounded to the nearest cent. */
export const lineCents = (item: Pick<PricedItem, "qtyHundredths" | "unitCents">): number =>
  Math.round((item.qtyHundredths * item.unitCents) / 100);

export function totals(items: PricedItem[], rules: TaxRules): Totals {
  const itemsCents = items.reduce((n, item) => n + lineCents(item), 0);
  const rate = Math.max(0, rules.taxRateBp) / 10_000;
  if (rate === 0) return { itemsCents, netCents: itemsCents, taxCents: 0, totalCents: itemsCents };
  if (rules.pricesIncludeTax) {
    const netCents = Math.round(itemsCents / (1 + rate));
    return { itemsCents, netCents, taxCents: itemsCents - netCents, totalCents: itemsCents };
  }
  const taxCents = Math.round(itemsCents * rate);
  return { itemsCents, netCents: itemsCents, taxCents, totalCents: itemsCents + taxCents };
}

/** Formats cents as money, for example 12345 -> "$123.45". Unknown currency codes fall back to USD. */
export function formatMoney(cents: number, currency = "USD"): string {
  const opts: Intl.NumberFormatOptions = { style: "currency", currency, minimumFractionDigits: 2 };
  try {
    return new Intl.NumberFormat("en-US", opts).format(cents / 100);
  } catch {
    return new Intl.NumberFormat("en-US", { ...opts, currency: "USD" }).format(cents / 100);
  }
}

/** Parses a money field such as "120", "120.5" or "$1,200.00" into cents. Returns null when it is not money. */
export function parseMoney(value: string): number | null {
  const cleaned = value.replace(/[\s,$£€]/g, "");
  if (cleaned === "") return 0;
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole = "0", frac = ""] = cleaned.split(".");
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
}

/** Parses a quantity such as "1", "2.5" or "0.25" into hundredths. Returns null when it is not a quantity. */
export function parseQty(value: string): number | null {
  const cleaned = value.trim();
  if (cleaned === "") return 100;
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole = "0", frac = ""] = cleaned.split(".");
  const n = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  return n > 0 ? n : null;
}

/** Cents back to an input value: 12050 -> "120.50", 12000 -> "120". */
export function centsToInput(cents: number): string {
  if (cents % 100 === 0) return String(cents / 100);
  return (cents / 100).toFixed(2);
}

/** Hundredths back to an input value: 150 -> "1.5". */
export function qtyToInput(hundredths: number): string {
  return String(Number((hundredths / 100).toFixed(2)));
}

/** Percent from basis points for display: 1000 -> "10", 825 -> "8.25". */
export const bpToPercent = (bp: number): string => String(Number((bp / 100).toFixed(2)));
