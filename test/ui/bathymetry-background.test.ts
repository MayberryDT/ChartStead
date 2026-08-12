import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const projectRoot = resolve(import.meta.dirname, "../..");

describe("ChartStead bathymetric outer-page background", () => {
  test("ships the selected dense static isobath asset", () => {
    const svg = readFileSync(resolve(projectRoot, "public/chartstead-bathymetry.svg"), "utf8");

    expect(svg).toContain('viewBox="0 0 1600 900"');
    expect(svg).toContain('preserveAspectRatio="xMidYMid slice"');
    expect(svg).toContain('aria-hidden="true"');
    expect(svg.match(/class="contour /g)).toHaveLength(235);
    expect(svg.match(/class="contour-label"/g)).toHaveLength(4);
    expect(svg.match(/class="sounding"/g)).toHaveLength(9);
    expect(svg.match(/class="contour [^"]*contour-approximate/g)).toHaveLength(2);
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
