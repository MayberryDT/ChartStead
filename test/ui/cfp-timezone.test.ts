import { describe, expect, it } from "vitest";

import {
  instantToLocalDateTime,
  localDateTimeToInstant,
} from "../../shared/cfp-timezone";

describe("CFP event-timezone conversion", () => {
  it("converts organizer wall time to one exact instant and back", () => {
    expect(
      localDateTimeToInstant("2030-06-01T12:00", "America/Los_Angeles"),
    ).toBe("2030-06-01T19:00:00.000Z");
    expect(
      instantToLocalDateTime("2030-06-01T19:00:00.000Z", "America/Los_Angeles"),
    ).toBe("2030-06-01T12:00");
  });

  it("rejects invalid zones and nonexistent daylight-saving wall times", () => {
    expect(() => localDateTimeToInstant("2030-06-01T12:00", "Mars/Olympus"))
      .toThrow("Choose a valid event timezone.");
    expect(() =>
      localDateTimeToInstant("2030-03-10T02:30", "America/Los_Angeles"),
    ).toThrow("That local time does not exist in America/Los_Angeles.");
  });
});
