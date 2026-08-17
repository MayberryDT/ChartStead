import { afterEach, describe, expect, it } from "vitest";

import { createClientId } from "../../src/id";

describe("createClientId", () => {
  const originalRandomUUID = globalThis.crypto?.randomUUID;

  afterEach(() => {
    if (originalRandomUUID) {
      Object.defineProperty(globalThis.crypto, "randomUUID", {
        configurable: true,
        value: originalRandomUUID,
      });
    }
  });

  it("still returns an id when crypto.randomUUID is missing", () => {
    Object.defineProperty(globalThis.crypto, "randomUUID", {
      configurable: true,
      value: undefined,
    });
    expect(typeof globalThis.crypto.randomUUID).not.toBe("function");
    const id = createClientId();
    expect(id).toMatch(/^[0-9a-f-]{36}$|^id-/i);
  });
});
