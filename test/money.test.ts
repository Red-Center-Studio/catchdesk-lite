import { describe, expect, it } from "vitest";
import { centsToInput, formatMoney, lineCents, parseMoney, parseQty, qtyToInput, totals } from "../src/lib/money";

const item = (qty: number, unit: number) => ({ qtyHundredths: qty, unitCents: unit });

describe("quote totals", () => {
  it("adds lines with no tax", () => {
    const t = totals([item(100, 12000), item(250, 1000)], { taxRateBp: 0, pricesIncludeTax: false });
    expect(t).toMatchObject({ itemsCents: 14500, netCents: 14500, taxCents: 0, totalCents: 14500 });
  });

  it("adds tax on top", () => {
    const t = totals([item(100, 10000)], { taxRateBp: 825, pricesIncludeTax: false });
    expect(t.taxCents).toBe(825);
    expect(t.totalCents).toBe(10825);
  });

  it("takes tax out of tax-inclusive prices", () => {
    const t = totals([item(100, 11000)], { taxRateBp: 1000, pricesIncludeTax: true });
    expect(t.totalCents).toBe(11000);
    expect(t.netCents).toBe(10000);
    expect(t.taxCents).toBe(1000);
  });

  it("rounds a fractional line to the nearest cent", () => {
    expect(lineCents({ qtyHundredths: 133, unitCents: 999 })).toBe(1329);
  });
});

describe("parsing money and quantities", () => {
  it("reads money the way people type it", () => {
    expect(parseMoney("120")).toBe(12000);
    expect(parseMoney("120.5")).toBe(12050);
    expect(parseMoney("$1,200.00")).toBe(120000);
    expect(parseMoney("")).toBe(0);
    expect(parseMoney("12.345")).toBeNull();
    expect(parseMoney("-5")).toBeNull();
    expect(parseMoney("abc")).toBeNull();
  });

  it("reads quantities and refuses zero", () => {
    expect(parseQty("1")).toBe(100);
    expect(parseQty("2.5")).toBe(250);
    expect(parseQty("")).toBe(100);
    expect(parseQty("0")).toBeNull();
    expect(parseQty("1/2")).toBeNull();
  });

  it("round-trips values back into inputs", () => {
    expect(centsToInput(12000)).toBe("120");
    expect(centsToInput(12050)).toBe("120.50");
    expect(qtyToInput(150)).toBe("1.5");
  });

  it("formats money in the chosen currency, falling back to USD", () => {
    expect(formatMoney(123456, "USD")).toBe("$1,234.56");
    expect(formatMoney(100, "EUR")).toBe("€1.00");
    expect(formatMoney(100, "NOPE")).toBe("$1.00");
  });
});
