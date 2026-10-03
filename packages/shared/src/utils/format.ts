/** Display formatting. Pure string transforms with no network or SDK access. */

/** `0x1234…abcd` — shortens hex identifiers without hiding which one they are. */
export function truncateMiddle(value: string, lead = 6, tail = 4): string {
  const trimmed = value.trim();
  if (trimmed.length <= lead + tail + 1) return trimmed;
  return `${trimmed.slice(0, lead)}…${trimmed.slice(-tail)}`;
}

/** Shortens a Hedera transaction id's visible middle, keeping `0.0.x@ts` readable. */
export function truncateTransactionId(txId: string): string {
  const [account, timestamp] = txId.trim().split("@");
  if (!account || !timestamp) return truncateMiddle(txId, 12, 6);
  return `${account}@${truncateMiddle(timestamp, 8, 4)}`;
}

/**
 * Compact duration: `45s`, `12m`, `3h 21m`, `40d 4h`.
 *
 * Deliberately coarse. Precision that implies meaning ("3h 21m 44s" for a 90-day
 * bound) reads as false accuracy.
 */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) return "unknown";
  const total = Math.max(0, Math.round(seconds));

  if (total < 60) return `${total}s`;

  const minutes = Math.floor(total / 60);
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const remainder = minutes % 60;
    return remainder === 0 ? `${hours}h` : `${hours}h ${remainder}m`;
  }

  const days = Math.floor(hours / 24);
  const remainderHours = hours % 24;
  return remainderHours === 0 ? `${days}d` : `${days}d ${remainderHours}h`;
}

/** Basis points as a percentage string: `50` -> `0.50%`. */
export function formatBps(bps: number, fractionDigits = 2): string {
  if (!Number.isFinite(bps)) return "unknown";
  const percent = bps / 100;
  return `${percent.toFixed(fractionDigits).replace(/\.?0+$/, "") || "0"}%`;
}

/** Percentage of a bound, for freshness meters: `97`. */
export function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return "unknown";
  return `${Math.round(value)}%`;
}

/** Grouped integer part with thin separators: `1234567` -> `1,234,567`. */
export function formatGrouped(value: string | bigint): string {
  const text = typeof value === "bigint" ? value.toString() : value.trim();
  if (!/^-?\d+$/.test(text)) return text;
  const negative = text.startsWith("-");
  const digits = negative ? text.slice(1) : text;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return negative ? `-${grouped}` : grouped;
}

/**
 * USD amount from a decimal string, with digit grouping and a **fixed** number of
 * decimal places.
 *
 * Unlike `formatScaled`, trailing zeros are kept: money is conventionally shown
 * to the precision it is quoted at, and "$1.50" reads differently from "$1.5" in
 * a financial context.
 */
export function formatUsd(decimalString: string, fractionDigits = 2): string {
  const text = decimalString.trim();
  const match = /^(-?)(\d*)(?:\.(\d*))?$/.exec(text);
  if (!match) return text;

  const [, sign, whole = "0", fraction = ""] = match;
  const fixedFraction = fraction.padEnd(fractionDigits, "0").slice(0, fractionDigits);
  return `${sign === "-" ? "-" : ""}$${formatGrouped(whole || "0")}.${fixedFraction}`;
}

/** Relative age from a unix-seconds publish time, evaluated against `nowSeconds`. */
export function formatAge(publishTime: number, nowSeconds: number): string {
  if (!Number.isInteger(publishTime) || publishTime <= 0) return "unknown";
  if (!Number.isFinite(nowSeconds)) return "unknown";
  const delta = Math.floor(nowSeconds - publishTime);
  if (delta < 0) return "in the future";
  if (delta < 5) return "just now";
  return `${formatDuration(delta)} ago`;
}

/** Unix seconds to `YYYY-MM-DD HH:MM:SS UTC`, for tables and CLI output. */
export function formatUnixSeconds(unixSeconds: number): string {
  if (!Number.isFinite(unixSeconds) || unixSeconds <= 0) return "—";
  return `${new Date(unixSeconds * 1000).toISOString().replace("T", " ").slice(0, 19)} UTC`;
}

/** Title-cases a status slug for display: `price-stale` -> `Price stale`. */
export function humanizeSlug(slug: string): string {
  return slug
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
