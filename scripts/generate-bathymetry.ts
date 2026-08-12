import { contours } from "d3-contour";
import { geoPath } from "d3-geo";
import { createNoise2D } from "simplex-noise";
import alea from "alea";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";

const OUTPUT_WIDTH = 1600;
const OUTPUT_HEIGHT = 900;
const VISIBLE_GRID_WIDTH = 180;
const VISIBLE_GRID_HEIGHT = 110;
const GRID_WIDTH = 225;
const GRID_HEIGHT = 138;
const CROP_X = (GRID_WIDTH - VISIBLE_GRID_WIDTH) / 2;
const CROP_Y = (GRID_HEIGHT - VISIBLE_GRID_HEIGHT) / 2;
const SEED = "chartstead-outer-page-basin-v1";
const PRIMARY_THRESHOLDS = [2, 5, 10, 15, 20, 30, 50];
const SUPPLEMENTAL_INTERVAL = 0.9;
const MAJOR_THRESHOLDS = new Set([10, 20, 50]);
const OUTPUT_PATH = resolve("public/chartstead-bathymetry.svg");

type Point = [number, number];

type TerrainFeature = {
  x: number;
  y: number;
  amplitude: number;
  sigmaX: number;
  sigmaY: number;
  angle: number;
};

type ContourRing = {
  threshold: number;
  points: Point[];
  area: number;
  length: number;
};

function round(value: number, precision = 2) {
  const multiplier = 10 ** precision;
  return Math.round(value * multiplier) / multiplier;
}

function buildThresholds() {
  const values = new Set(PRIMARY_THRESHOLDS);
  for (let value = SUPPLEMENTAL_INTERVAL; value < 60; value += SUPPLEMENTAL_INTERVAL) {
    values.add(round(value));
  }
  return [...values].sort((left, right) => left - right);
}

function createTerrainFeatures(): TerrainFeature[] {
  const random = alea(`${SEED}-features`);
  const anchors: Point[] = [
    [0.08, 0.14], [0.3, 0.12], [0.57, 0.16], [0.86, 0.2],
    [0.13, 0.72], [0.38, 0.83], [0.67, 0.74], [0.9, 0.7],
  ];

  const features = anchors.map(([anchorX, anchorY], index): TerrainFeature => {
    const basin = index % 3 !== 1;
    return {
      x: anchorX + (random() - 0.5) * 0.12,
      y: anchorY + (random() - 0.5) * 0.12,
      amplitude: (basin ? 1 : -1) * (0.62 + random() * 0.34),
      sigmaX: 0.055 + random() * 0.085,
      sigmaY: 0.048 + random() * 0.078,
      angle: random() * Math.PI,
    };
  });

  features.push({
    x: 0.5,
    y: 0.48,
    amplitude: -0.6,
    sigmaX: 0.26,
    sigmaY: 0.045,
    angle: -0.45,
  });
  return features;
}

function gaussian(feature: TerrainFeature, x: number, y: number) {
  const dx = x - feature.x;
  const dy = y - feature.y;
  const cos = Math.cos(feature.angle);
  const sin = Math.sin(feature.angle);
  const rotatedX = dx * cos + dy * sin;
  const rotatedY = -dx * sin + dy * cos;
  const distance = (rotatedX ** 2) / (2 * feature.sigmaX ** 2)
    + (rotatedY ** 2) / (2 * feature.sigmaY ** 2);
  return feature.amplitude * Math.exp(-distance);
}

function generateDepthField() {
  const broadNoise = createNoise2D(alea(`${SEED}-broad`));
  const mediumNoise = createNoise2D(alea(`${SEED}-medium`));
  const warpXNoise = createNoise2D(alea(`${SEED}-warp-x`));
  const warpYNoise = createNoise2D(alea(`${SEED}-warp-y`));
  const features = createTerrainFeatures();
  const raw: number[] = [];

  for (let y = 0; y < GRID_HEIGHT; y += 1) {
    for (let x = 0; x < GRID_WIDTH; x += 1) {
      const normalizedX = (x - CROP_X) / VISIBLE_GRID_WIDTH;
      const normalizedY = (y - CROP_Y) / VISIBLE_GRID_HEIGHT;
      const warpedX = normalizedX + warpXNoise(normalizedX * 1.08 - 7.3, normalizedY * 1.08 + 2.7) * 0.13;
      const warpedY = normalizedY + warpYNoise(normalizedX * 1.08 + 11.8, normalizedY * 1.08 - 5.1) * 0.13;

      let fractionalBrownianMotion = 0;
      let amplitude = 0.2;
      let frequency = 1.05;
      for (let octave = 0; octave < 4; octave += 1) {
        const noise = octave < 2 ? broadNoise : mediumNoise;
        fractionalBrownianMotion += noise(
          warpedX * frequency + octave * 13.7,
          warpedY * frequency - octave * 9.1,
        ) * amplitude;
        frequency *= 2.05;
        amplitude *= 0.5;
      }

      const analyticTerrain = features.reduce(
        (total, feature) => total + gaussian(feature, normalizedX, normalizedY),
        0,
      );
      const shelf = (normalizedX * 0.72 + normalizedY * 0.28 - 0.5) * 0.12;
      raw.push(fractionalBrownianMotion + analyticTerrain + shelf);
    }
  }

  const sorted = [...raw].sort((left, right) => left - right);
  const low = sorted[Math.floor(sorted.length * 0.015)]!;
  const high = sorted[Math.floor(sorted.length * 0.985)]!;
  return raw.map((value) => Math.max(0, Math.min(60, ((value - low) / (high - low)) * 60)));
}

function toScreenPoint([x, y]: Point): Point {
  return [
    ((x - CROP_X) / VISIBLE_GRID_WIDTH) * OUTPUT_WIDTH,
    ((y - CROP_Y) / VISIBLE_GRID_HEIGHT) * OUTPUT_HEIGHT,
  ];
}

function ringLength(points: Point[]) {
  let total = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    total += Math.hypot(
      points[index + 1]![0] - points[index]![0],
      points[index + 1]![1] - points[index]![1],
    );
  }
  return total;
}

function signedArea(points: Point[]) {
  let total = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    total += points[index]![0] * points[index + 1]![1] - points[index + 1]![0] * points[index]![1];
  }
  return total / 2;
}

function extractRings(depthValues: number[]): ContourRing[] {
  const geometries = contours()
    .size([GRID_WIDTH, GRID_HEIGHT])
    .thresholds(buildThresholds())
    .smooth(true)(depthValues);
  const rings: ContourRing[] = [];

  for (const geometry of geometries) {
    for (const polygon of geometry.coordinates) {
      for (const coordinates of polygon) {
        const points = coordinates.map((point) => toScreenPoint(point as Point));
        const xs = points.map(([x]) => x);
        const ys = points.map(([, y]) => y);
        const visible = Math.max(...xs) >= 0 && Math.min(...xs) <= OUTPUT_WIDTH
          && Math.max(...ys) >= 0 && Math.min(...ys) <= OUTPUT_HEIGHT;
        const length = ringLength(points);
        if (!visible || length < 32) continue;
        rings.push({
          threshold: geometry.value,
          points,
          area: Math.abs(signedArea(points)),
          length,
        });
      }
    }
  }
  return rings;
}

function ringPath(points: Point[]) {
  return geoPath().digits(0)({ type: "Polygon", coordinates: [points] }) ?? "";
}

function chooseLabels(rings: ContourRing[]) {
  const labels: Array<{ ring: ContourRing; points: Point[]; threshold: number; startOffset: number }> = [];
  for (const threshold of [10, 20, 50, 10, 20]) {
    const candidates = rings
      .filter((ring) => ring.threshold === threshold && ring.length > 220 && ring.area > 1200)
      .sort((left, right) => right.area - left.area);

    for (const ring of candidates) {
      if (labels.some((label) => label.ring === ring)) continue;
      const points = [...ring.points];
      let bestIndex = -1;
      let bestScore = -Infinity;
      let running = 0;
      let bestOffset = 0;
      for (let index = 0; index < points.length - 6; index += 1) {
        const current = points[index]!;
        const next = points[index + 5]!;
        const dx = next[0] - current[0];
        const dy = next[1] - current[1];
        const inside = current[0] > 55 && current[0] < OUTPUT_WIDTH - 55
          && current[1] > 45 && current[1] < OUTPUT_HEIGHT - 45;
        const outsideFade = Math.abs(current[0] - OUTPUT_WIDTH / 2) > 350
          || Math.abs(current[1] - OUTPUT_HEIGHT / 2) > 270;
        const score = Math.abs(dx) - Math.abs(dy) * 2.8;
        if (inside && outsideFade && score > bestScore) {
          bestIndex = index;
          bestScore = score;
          bestOffset = running;
        }
        running += Math.hypot(points[index + 1]![0] - current[0], points[index + 1]![1] - current[1]);
      }
      if (bestIndex < 0 || bestScore < 18) continue;
      const dx = points[bestIndex + 5]![0] - points[bestIndex]![0];
      if (dx < 0) points.reverse();
      labels.push({
        ring,
        points,
        threshold,
        startOffset: dx < 0 ? Math.max(0, ring.length - bestOffset - 90) : bestOffset,
      });
      break;
    }
    if (labels.length >= 4) break;
  }
  return labels;
}

function sampleDepth(values: number[], x: number, y: number) {
  const gridX = Math.max(0, Math.min(
    GRID_WIDTH - 1,
    Math.round(CROP_X + (x / OUTPUT_WIDTH) * VISIBLE_GRID_WIDTH),
  ));
  const gridY = Math.max(0, Math.min(
    GRID_HEIGHT - 1,
    Math.round(CROP_Y + (y / OUTPUT_HEIGHT) * VISIBLE_GRID_HEIGHT),
  ));
  return values[gridY * GRID_WIDTH + gridX]!;
}

function generateSoundings(depthValues: number[]) {
  const random = alea(`${SEED}-soundings`);
  const soundings: Array<{ x: number; y: number; value: number }> = [];
  let attempts = 0;
  while (soundings.length < 9 && attempts < 500) {
    attempts += 1;
    const x = 60 + random() * (OUTPUT_WIDTH - 120);
    const y = 52 + random() * (OUTPUT_HEIGHT - 104);
    const awayFromForm = Math.abs(x - OUTPUT_WIDTH / 2) > 365 || Math.abs(y - OUTPUT_HEIGHT / 2) > 285;
    const awayFromOthers = soundings.every((sounding) => Math.hypot(sounding.x - x, sounding.y - y) > 105);
    if (!awayFromForm || !awayFromOthers) continue;
    soundings.push({ x: round(x, 1), y: round(y, 1), value: Math.max(1, Math.round(sampleDepth(depthValues, x, y))) });
  }
  return soundings;
}

export function generateBathymetrySvg() {
  const depthValues = generateDepthField();
  const rings = extractRings(depthValues);
  const labels = chooseLabels(rings);
  const soundings = generateSoundings(depthValues);
  const dashed = new Set(
    rings
      .filter((ring) => [15, 30].includes(ring.threshold) && ring.length > 260 && ring.area > 1500)
      .sort((left, right) => right.length - left.length)
      .slice(0, 2),
  );
  const labelMap = new Map(labels.map((label, index) => [label.ring, { ...label, id: `contour-label-${index}` }]));

  const paths = rings.map((ring) => {
    const label = labelMap.get(ring);
    const classes = ["contour", MAJOR_THRESHOLDS.has(ring.threshold) ? "contour-major" : "contour-minor"];
    if (dashed.has(ring)) classes.push("contour-approximate");
    return `<path${label ? ` id="${label.id}"` : ""} class="${classes.join(" ")}" d="${ringPath(label?.points ?? ring.points)}"/>`;
  }).join("");
  const labelText = [...labelMap.values()].map((label) =>
    `<text class="contour-label"><textPath href="#${label.id}" startOffset="${round(label.startOffset, 1)}">${label.threshold}</textPath></text>`,
  ).join("");
  const soundingText = soundings.map((sounding) =>
    `<text class="sounding" x="${sounding.x}" y="${sounding.y}">${sounding.value}</text>`,
  ).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${OUTPUT_WIDTH} ${OUTPUT_HEIGHT}" preserveAspectRatio="xMidYMid slice" role="presentation" aria-hidden="true"><style>.contour{fill:none;stroke:#2f5d98;stroke-linecap:round;stroke-linejoin:round;vector-effect:non-scaling-stroke}.contour-minor{stroke-width:.7;stroke-opacity:.08}.contour-major{stroke-width:1;stroke-opacity:.13}.contour-approximate{stroke-dasharray:11 8;stroke-opacity:.07}.contour-label,.sounding{fill:#526f8d;font-family:ui-monospace,"IBM Plex Mono",monospace;paint-order:stroke;stroke:#f3f5f7;stroke-width:4;stroke-linejoin:round}.contour-label{font-size:14px;font-weight:600;letter-spacing:.06em}.sounding{font-size:12px;font-weight:500;fill-opacity:.28}</style><g>${paths}${labelText}${soundingText}</g></svg>`;
}

async function main() {
  const svg = generateBathymetrySvg();
  if (gzipSync(svg).byteLength >= 150 * 1024) {
    throw new Error("Generated bathymetry exceeds the 150 KB compressed budget");
  }
  await mkdir(resolve("public"), { recursive: true });
  await writeFile(OUTPUT_PATH, svg);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  await main();
}
