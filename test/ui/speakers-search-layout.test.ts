import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(import.meta.dirname, "../..");
const css = readFileSync(resolve(projectRoot, "src/styles.css"), "utf8");
const speakerDirectory = readFileSync(resolve(projectRoot, "src/SpeakerDirectory.tsx"), "utf8");

describe("Ticket 65 Speakers search layout", () => {
  it("keeps Speakers search as one topbar field control (icon + input)", () => {
    expect(speakerDirectory).toMatch(
      /className="field search-field topbar-search"/,
    );
    expect(speakerDirectory).toMatch(/aria-label="Search speakers"/);

    // Grid/uppercase label styles must not target the search .field (that stacked the icon).
    expect(css).toMatch(/\.speaker-directory-tools label:not\(\.field\)/);
    expect(css).not.toMatch(
      /\.speaker-directory-tools label,\s*\n\.speaker-directory-form label \{/,
    );

    // Bordered input chrome must not re-box the composer inside .field.
    expect(css).toMatch(/\.speaker-directory-tools label:not\(\.field\) input/);
    expect(css).toMatch(
      /\.topbar-tools \.speaker-directory-tools \.field\.topbar-search \{\s*[\s\S]*?display:\s*flex;/,
    );
    expect(css).toMatch(
      /\.topbar-tools \.speaker-directory-tools \.field\.topbar-search input \{\s*[\s\S]*?border:\s*0;/,
    );
  });
});
