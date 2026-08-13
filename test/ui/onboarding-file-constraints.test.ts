import { describe, expect, it } from "vitest";

import {
  fileMatchesOnboardingConstraints,
  formatFileSize,
  resolveOnboardingFileConstraints,
} from "../../shared/onboarding-tasks";

describe("speaker task file constraints", () => {
  it("documents and enforces slide types, extensions, and size before upload", () => {
    const constraints = resolveOnboardingFileConstraints("slides");

    expect(constraints.acceptExtensions).toEqual([".pdf", ".ppt", ".pptx"]);
    expect(formatFileSize(constraints.maxBytes)).toBe("25 MB");
    expect(
      fileMatchesOnboardingConstraints(
        { name: "deck.pdf", type: "application/pdf", size: 1024 },
        constraints,
      ),
    ).toBeNull();
    expect(
      fileMatchesOnboardingConstraints(
        { name: "deck.exe", type: "application/octet-stream", size: 1024 },
        constraints,
      ),
    ).toMatch(/file types/i);
    expect(
      fileMatchesOnboardingConstraints(
        { name: "deck.pdf", type: "application/pdf", size: constraints.maxBytes + 1 },
        constraints,
      ),
    ).toBe("Files must be 25 MB or smaller.");
  });
});
