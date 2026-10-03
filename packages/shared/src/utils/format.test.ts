import { describe, expect, it } from "vitest";
import {
  formatAge,
  formatBps,
  formatDuration,
  formatGrouped,
  formatPercent,
  formatUnixSeconds,
  formatUsd,
  humanizeSlug,
  truncateMiddle,
  truncateTransactionId,
} from "./format";

describe("truncateMiddle", () => {
  it("keeps the head and tail of a hash readable", () => {
    const hash = `0x${"ab".repeat(32)}`;
    expect(truncateMiddle(hash)).toBe("0xabab…abab");
  });

  it("leaves short values untouched instead of mangling them", () => {
    expect(truncateMiddle("0x1234")).toBe("0x1234");
    expect(truncateMiddle("abc")).toBe("abc");
  });

  it("honours custom lead and tail widths", () => {
    expect(truncateMiddle("0x0123456789abcdef", 4, 2)).toBe("0x01…ef");
  });

  it("trims before measuring", () => {
    expect(truncateMiddle("  0x1234  ")).toBe("0x1234");
  });
});

describe("truncateTransactionId", () => {
  it("keeps the account id and shortens only the timestamp", () => {
    expect(truncateTransactionId("0.0.5000002@1787525955.000000000")).toBe("0.0.5000002@17875259…0000");
  });

  it("falls back to a plain truncation for malformed input", () => {
    expect(truncateTransactionId("garbage")).toBe("garbage");
  });
});

describe("formatDuration", () => {
  it("scales the unit to the magnitude", () => {
    expect(formatDuration(0)).toBe("0s");
    expect(formatDuration(45)).toBe("45s");
    expect(formatDuration(59)).toBe("59s");
    expect(formatDuration(60)).toBe("1m");
    expect(formatDuration(12 * 60)).toBe("12m");
    expect(formatDuration(3600)).toBe("1h");
    expect(formatDuration(3 * 3600 + 21 * 60)).toBe("3h 21m");
    expect(formatDuration(86_400)).toBe("1d");
    expect(formatDuration(40 * 86_400 + 4 * 3600)).toBe("40d 4h");
  });

  it("clamps negative input rather than rendering nonsense", () => {
    expect(formatDuration(-5)).toBe("0s");
  });

  it("refuses to invent precision for non-finite input", () => {
    expect(formatDuration(Number.NaN)).toBe("unknown");
  });

  it("formats the shipped 90 day default", () => {
    expect(formatDuration(90 * 24 * 60 * 60)).toBe("90d");
  });
});

describe("formatBps", () => {
  it("converts basis points to a percentage", () => {
    expect(formatBps(50)).toBe("0.5%");
    expect(formatBps(1)).toBe("0.01%");
    expect(formatBps(100)).toBe("1%");
    expect(formatBps(124)).toBe("1.24%");
    expect(formatBps(0)).toBe("0%");
  });

  it("does not overstate precision it does not have", () => {
    expect(formatBps(1, 0)).toBe("0%");
  });

  it("reports unknown for non-finite input", () => {
    expect(formatBps(Number.NaN)).toBe("unknown");
  });
});

describe("formatPercent", () => {
  it("rounds to a whole percent for meters", () => {
    expect(formatPercent(96.6)).toBe("97%");
    expect(formatPercent(0)).toBe("0%");
    expect(formatPercent(Number.NaN)).toBe("unknown");
  });
});

describe("formatGrouped", () => {
  it("groups the integer part", () => {
    expect(formatGrouped("1234567")).toBe("1,234,567");
    expect(formatGrouped("100")).toBe("100");
    expect(formatGrouped(1000n)).toBe("1,000");
    expect(formatGrouped("-1234567")).toBe("-1,234,567");
  });

  it("passes non-integers through untouched instead of corrupting them", () => {
    expect(formatGrouped("12.5")).toBe("12.5");
  });
});

describe("formatUsd", () => {
  it("keeps exactly the requested number of decimals, the convention for money", () => {
    expect(formatUsd("1")).toBe("$1.00");
    expect(formatUsd("1.5")).toBe("$1.50");
    expect(formatUsd("0.08055012")).toBe("$0.08");
    expect(formatUsd("1234567.891")).toBe("$1,234,567.89");
    expect(formatUsd("5", 4)).toBe("$5.0000");
    expect(formatUsd("0.123456", 6)).toBe("$0.123456");
  });

  it("truncates rather than rounds up", () => {
    expect(formatUsd("1.999")).toBe("$1.99");
  });

  it("handles negatives and malformed input", () => {
    expect(formatUsd("-2.5")).toBe("-$2.50");
    expect(formatUsd("abc")).toBe("abc");
  });
});

describe("formatAge", () => {
  const now = 1_787_526_000;

  it("renders a recent observation as 'just now'", () => {
    expect(formatAge(now - 1, now)).toBe("just now");
  });

  it("renders the live HBAR/USD feed age", () => {
    expect(formatAge(1787525955, now)).toBe("45s ago");
    expect(formatAge(1787525955 - 40 * 86_400, now)).toBe("40d ago");
  });

  it("flags a publishTime in the future instead of showing a negative age", () => {
    expect(formatAge(now + 60, now)).toBe("in the future");
  });

  it("reports unknown for a feed that has never published", () => {
    expect(formatAge(0, now)).toBe("unknown");
    expect(formatAge(now, Number.NaN)).toBe("unknown");
  });
});

describe("formatUnixSeconds", () => {
  it("renders a UTC timestamp", () => {
    expect(formatUnixSeconds(1787525955)).toBe("2026-08-23 22:59:15 UTC");
  });

  it("renders a dash for unset timestamps", () => {
    expect(formatUnixSeconds(0)).toBe("—");
    expect(formatUnixSeconds(Number.NaN)).toBe("—");
  });
});

describe("humanizeSlug", () => {
  it("turns a rejection code into a label", () => {
    expect(humanizeSlug("price-stale")).toBe("Price Stale");
    expect(humanizeSlug("deviation_too_high")).toBe("Deviation Too High");
    expect(humanizeSlug("")).toBe("");
  });
});
