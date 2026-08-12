import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const projectRoot = resolve(import.meta.dirname, "../..");

describe("ChartStead bathymetric outer-page background", () => {
  test("ships the selected full-field static isobath asset", () => {
    const svg = readFileSync(resolve(projectRoot, "public/chartstead-bathymetry.svg"), "utf8");
    const pathCount = svg.match(/<path/g)?.length ?? 0;
    const majorCount = svg.match(/class="[^"]*contour-major/g)?.length ?? 0;
    const approximateCount = svg.match(/class="[^"]*contour-approximate/g)?.length ?? 0;
    const labelCount = svg.match(/<text class="contour-label"/g)?.length ?? 0;
    const soundingCount = svg.match(/<text class="sounding"/g)?.length ?? 0;

    expect(svg).toContain('viewBox="0 0 1600 900"');
    expect(svg).toContain('preserveAspectRatio="xMidYMid slice"');
    expect(svg).toContain('aria-hidden="true"');
    expect(pathCount).toBeGreaterThanOrEqual(180);
    expect(majorCount).toBeGreaterThanOrEqual(4);
    expect(approximateCount).toBeGreaterThanOrEqual(1);
    expect(approximateCount).toBeLessThanOrEqual(2);
    expect(labelCount).toBeGreaterThanOrEqual(3);
    expect(labelCount).toBeLessThanOrEqual(5);
    expect(soundingCount).toBeGreaterThanOrEqual(6);
    expect(soundingCount).toBeLessThanOrEqual(12);
    // The CSS background has no separate 0.48 opacity layer, so encode the
    // approved effective line weights directly in the generated asset.
    expect(svg).toContain("stroke-opacity:.08");
    expect(svg).toContain("stroke-opacity:.13");
    expect(svg).toContain("stroke-opacity:.07");
    expect(gzipSync(svg).byteLength).toBeLessThan(150 * 1024);
  });

  test("uses the bathymetry and continuity fade on both outer shells", () => {
    const css = readFileSync(resolve(projectRoot, "src/styles.css"), "utf8");

    expect(css).toMatch(/\.sign-in-shell,\s*\.cfp-shell\s*\{/);
    expect(css).toContain('url("/chartstead-bathymetry.svg")');
    expect(css).toContain("radial-gradient(");
    expect(css).not.toMatch(/linear-gradient\(rgba\(8, 29, 58, 0\.035\) 1px/);
  });
});
