import { describe, expect, it } from "vitest";

import {
  applyPullWinsToLocalRecord,
  CHARTSTEAD_AIRTABLE_TEMPLATE,
  mapAirtableRecordToChartstead,
  mapAirtableRecordsToChanges,
} from "../../shared/airtable-field-map";

describe("ChartStead Airtable field map", () => {
  it("documents a complete base template with stable ChartStead id fields", () => {
    expect(CHARTSTEAD_AIRTABLE_TEMPLATE.schemaVersion).toBe(1);
    expect(CHARTSTEAD_AIRTABLE_TEMPLATE.tables.map((t) => t.kind).sort()).toEqual(
      ["event", "session", "speaker", "submission", "task"].sort(),
    );
    for (const table of CHARTSTEAD_AIRTABLE_TEMPLATE.tables) {
      expect(table.chartsteadIdField).toMatch(/ChartStead/);
      expect(table.fields.length).toBeGreaterThan(0);
      expect(table.fields.every((f) => f.pullWins)).toBe(true);
    }
  });

  it("maps Airtable submission fields onto ChartStead properties using stable ids", () => {
    const change = mapAirtableRecordToChartstead("submission", {
      id: "recSub1",
      fields: {
        "ChartStead Submission ID": "SUB-ABC12345",
        Title: "Rewritten title from Airtable",
        Abstract: "Updated abstract",
        "Track ID": "platform",
        "Speaker Name": "Ada Lovelace",
        "Speaker Email": "ada@example.com",
        Biography: "Bio from Airtable",
        "Supporting Link": "https://example.com/talk",
        // Unmapped / ignored noise
        "Internal Tag": "ignore-me",
      },
    });

    expect(change).toEqual({
      kind: "submission",
      chartsteadId: "SUB-ABC12345",
      airtableRecordId: "recSub1",
      mappedValues: {
        title: "Rewritten title from Airtable",
        abstract: "Updated abstract",
        trackId: "platform",
        speakerName: "Ada Lovelace",
        speakerEmail: "ada@example.com",
        biography: "Bio from Airtable",
        supportingLink: "https://example.com/talk",
      },
    });
  });

  it("skips Airtable rows without a ChartStead id", () => {
    expect(
      mapAirtableRecordToChartstead("speaker", {
        id: "recX",
        fields: { Name: "Orphan" },
      }),
    ).toBeNull();
  });

  it("lets Airtable win on mapped fields without overwriting local-only operational state", () => {
    const local = {
      id: "SUB-ABC12345",
      title: "Local title",
      abstract: "Local abstract",
      speakerName: "Local speaker",
      status: "approve",
      programOutcome: "accepted",
      committeeNote: "Keep this private note",
      privateNote: "Keep this too",
      reviewVersion: 4,
      confirmationEmailStatus: "sent",
      formId: "main-cfp",
    };

    const change = mapAirtableRecordToChartstead("submission", {
      id: "recSub1",
      fields: {
        "ChartStead Submission ID": "SUB-ABC12345",
        Title: "Airtable title",
        Abstract: "Airtable abstract",
        "Speaker Name": "Airtable speaker",
      },
    });
    expect(change).not.toBeNull();

    const merged = applyPullWinsToLocalRecord(
      "submission",
      local,
      change!.mappedValues,
    );

    expect(merged.title).toBe("Airtable title");
    expect(merged.abstract).toBe("Airtable abstract");
    expect(merged.speakerName).toBe("Airtable speaker");
    expect(merged.status).toBe("approve");
    expect(merged.programOutcome).toBe("accepted");
    expect(merged.committeeNote).toBe("Keep this private note");
    expect(merged.privateNote).toBe("Keep this too");
    expect(merged.reviewVersion).toBe(4);
    expect(merged.confirmationEmailStatus).toBe("sent");
    expect(merged.formId).toBe("main-cfp");
  });

  it("never applies local-only keys even if they appear in mappedValues", () => {
    const local = {
      id: "SUB-1",
      title: "T",
      status: "unreviewed",
      committeeNote: "secret",
    };
    const merged = applyPullWinsToLocalRecord("submission", local, {
      title: "New",
      status: "deny",
      committeeNote: "leaked",
      privateNote: "nope",
    });
    expect(merged.title).toBe("New");
    expect(merged.status).toBe("unreviewed");
    expect(merged.committeeNote).toBe("secret");
    expect("privateNote" in merged).toBe(false);
  });

  it("maps batches of records", () => {
    const changes = mapAirtableRecordsToChanges("session", [
      {
        id: "rec1",
        fields: {
          "ChartStead Session ID": "sess-1",
          Title: "Keynote",
          "Room ID": "ballroom",
        },
      },
      {
        id: "rec2",
        fields: { Title: "Missing id" },
      },
    ]);
    expect(changes).toHaveLength(1);
    expect(changes[0]?.chartsteadId).toBe("sess-1");
    expect(changes[0]?.mappedValues.roomId).toBe("ballroom");
  });
});
