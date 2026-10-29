/** Verifies WCAG contrast of design-token pairings in globals.css. Exits non-zero on failure. */
import { readFileSync } from "node:fs";

const css = readFileSync("src/app/globals.css", "utf8");
const token = (name: string) => {
  const m = css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-f]{6})`, "i"));
  if (!m) throw new Error(`Missing token ${name}`);
  return m[1]!;
};
const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
};
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
};

// [foreground, background, minimum]
const pairs: [string, string, number][] = [];
for (const bg of ["canvas", "surface", "subtle", "muted"]) for (const fg of ["ink", "ink-muted", "ink-faint", "accent-text", "success", "warning", "danger", "info"]) pairs.push([fg, bg, 4.5]);
pairs.push(["surface", "accent", 4.5], ["surface", "accent-hover", 4.5], ["accent-text", "accent-soft", 4.5], ["surface", "danger", 4.5]);
for (const s of ["success", "warning", "danger", "info"]) pairs.push([s, `${s}-bg`, 4.5]);
pairs.push(["graphite-text", "graphite", 4.5], ["graphite-text", "graphite-raised", 4.5], ["surface", "graphite", 4.5]);
pairs.push(["line-strong", "surface", 1.5]); // non-text boundary (inputs) — WCAG 1.4.11 needs 3:1 only for meaningful UI; borders are supplemented by labels

let failed = 0;
for (const [fg, bg, min] of pairs) {
  const r = ratio(token(fg), token(bg));
  const ok = r >= min;
  if (!ok) failed++;
  console.log(`${ok ? "✓" : "✗"} ${fg.padEnd(14)} on ${bg.padEnd(16)} ${r.toFixed(2)} (min ${min})`);
}
if (failed) {
  console.error(`${failed} pairing(s) below threshold`);
  process.exit(1);
}
