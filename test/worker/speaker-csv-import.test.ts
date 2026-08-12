import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import type {
  OnboardingBoard,
  OrganizerPrincipal,
} from "../../shared/events";
import { createApp } from "../../worker/app";

const eventId = "pacific-open-data-summit-2026";
const otherEventId = "ai-engineer-worlds-fair-2026";

const admin = {
  id: "t25-admin",
  displayName: "CSV Import Admin",
  role: "admin",
  eventIds: [eventId, otherEventId],
  rolesByEvent: { [eventId]: "admin", [otherEventId]: "admin" },
} satisfies OrganizerPrincipal;

const reviewer = {
  id: "t25-reviewer",
  displayName: "CSV Import Reviewer",
  role: "reviewer",
  eventIds: [eventId],
  rolesByEvent: { [eventId]: "reviewer" },
} satisfies OrganizerPrincipal;

const adminApp = createApp({ resolvePrincipal: async () => admin });
const reviewerApp = createApp({ resolvePrincipal: async () => reviewer });

const mapping = {
  name: "Full Name",
  email: "Email Address",
  biography: "Bio",
  title: "Job Title",
  organization: "Company",
};

interface SpeakerCsvImportPreview {
  digest: string;
  headers: string[];
  rows: Array<{
    rowNumber: number;
    outcome: "create" | "reuse" | "update" | "skip" | "invalid";
    values: Record<string, string>;
    feedback: string[];
    matches: Array<{ speakerId: string }>;
    selectedSpeakerId: string | null;
  }>;
  totals: Record<"create" | "reuse" | "update" | "skip" | "invalid", number>;
}

interface SpeakerCsvImportApplyResult {
  id: string;
  idempotencyKey: string;
  previewDigest: string;
  appliedAt: string;
  actorId: string;
  actorName: string;
  totals: {
    created: number;
    reused: number;
    updated: number;
    skipped: number;
    invalid: number;
  };
  rows: Array<{
    rowNumber: number;
    outcome: "created" | "reused" | "updated" | "skipped";
    speakerId: string | null;
  }>;
}

async function board(event = eventId): Promise<OnboardingBoard> {
  const response = await adminApp.request(
    `https://chartstead.test/api/events/${event}/onboarding`,
    undefined,
    env,
  );
  expect(response.status).toBe(200);
  return response.json<OnboardingBoard>();
}

async function addSpeaker(event: string, input: Record<string, unknown>) {
  const response = await adminApp.request(
    `https://chartstead.test/api/events/${event}/speakers`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    },
    env,
  );
  expect(response.status).toBe(201);
  return response.json<{ speaker: { speakerId: string } }>();
}

async function preview(
  event: string,
  csvText: string,
  app = adminApp,
) {
  return app.request(
    `https://chartstead.test/api/events/${event}/speaker-imports/preview`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ csvText, mapping }),
    },
    env,
  );
}

describe("Ticket 25 speaker CSV import", () => {
  beforeAll(async () => {
    for (const id of [eventId, otherEventId]) {
      const response = await adminApp.request(
        `https://chartstead.test/api/events/${id}`,
        undefined,
        env,
      );
      expect(response.status).toBe(200);
    }
  });

  it("previews mapped create, update, skip, duplicate, and invalid rows without side effects", async () => {
    const existing = await addSpeaker(eventId, {
      name: "Existing Import Person",
      email: "existing.import@example.test",
      biography: "Old biography",
      titleSnapshot: "Director",
      organizationSnapshot: "Existing Org",
      role: "invited",
      createNewIdentity: true,
    });
    const identical = await addSpeaker(eventId, {
      name: "Existing Skip Person",
      email: "existing.skip@example.test",
      biography: "Unchanged biography",
      titleSnapshot: "Fellow",
      organizationSnapshot: "Skip Org",
      role: "invited",
      createNewIdentity: true,
    });
    const before = await board();
    const csvText = [
      "Full Name,Email Address,Bio,Job Title,Company",
      '"New, Person",new.import@example.test,"Line one, with comma",Engineer,New Org',
      "Existing Import Person,existing.import@example.test,New biography,Director,Existing Org",
      "Existing Skip Person,existing.skip@example.test,Unchanged biography,Fellow,Skip Org",
      "Duplicate Person,new.import@example.test,Duplicate,Engineer,New Org",
      "Missing Email,,No address,Designer,Missing Org",
    ].join("\n");

    const response = await preview(eventId, csvText);
    expect(response.status).toBe(200);
    const body = await response.json<SpeakerCsvImportPreview>();
    expect(body.digest).toMatch(/^[a-f0-9]{64}$/);
    expect(body.headers).toEqual([
      "Full Name",
      "Email Address",
      "Bio",
      "Job Title",
      "Company",
    ]);
    expect(body.rows.map((row) => [row.rowNumber, row.outcome])).toEqual([
      [2, "invalid"],
      [3, "update"],
      [4, "skip"],
      [5, "invalid"],
      [6, "invalid"],
    ]);
    expect(body.rows[0]).toMatchObject({
      values: { name: "New, Person", biography: "Line one, with comma" },
      feedback: ["Email is duplicated by another CSV row."],
    });
    expect(body.rows[1]).toMatchObject({
      selectedSpeakerId: existing.speaker.speakerId,
      feedback: ["Current name or biography differs; approve an update explicitly."],
    });
    expect(body.rows[2]).toMatchObject({
      selectedSpeakerId: identical.speaker.speakerId,
      feedback: ["Speaker and event participation already match; nothing will change."],
    });
    expect(body.rows[3].feedback).toEqual([
      "Email is duplicated by another CSV row.",
    ]);
    expect(body.rows[4].feedback).toEqual(["Email is required."]);
    expect(body.totals).toEqual({
      create: 0,
      reuse: 0,
      update: 1,
      skip: 1,
      invalid: 3,
    });

    expect(await board()).toEqual(before);
    const audits = await adminApp.request(
      `https://chartstead.test/api/events/${eventId}/speaker-imports`,
      undefined,
      env,
    );
    expect(audits.status).toBe(200);
    await expect(audits.json()).resolves.toEqual({ imports: [] });
  });

  it("rejects malformed CSV and unmapped required columns with actionable feedback", async () => {
    const malformed = await preview(
      eventId,
      'Full Name,Email Address,Bio,Job Title,Company\n"Unclosed,person@example.test,Bio,Title,Org',
    );
    expect(malformed.status).toBe(400);
    await expect(malformed.json()).resolves.toEqual({
      error: "CSV row 2 has an unclosed quoted field.",
    });

    const missingMapping = await adminApp.request(
      `https://chartstead.test/api/events/${eventId}/speaker-imports/preview`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          csvText: "Name,Email\nAda,ada@example.test",
          mapping: {
            name: "Name",
            email: "Email",
            biography: null,
            title: "Name",
            organization: "Company",
          },
        }),
      },
      env,
    );
    expect(missingMapping.status).toBe(400);
    await expect(missingMapping.json()).resolves.toEqual({
      error: 'Mapped column "Company" was not found in the CSV header.',
    });

    const duplicateRows = await preview(
      eventId,
      [
        "Full Name,Email Address,Bio,Job Title,Company",
        "Repeated Speaker,repeated@example.test,Bio,Director,Repeated Org",
        "Repeated Speaker,repeated@example.test,Bio,Director,Repeated Org",
      ].join("\n"),
    );
    expect(duplicateRows.status).toBe(200);
    const duplicateBody = await duplicateRows.json<SpeakerCsvImportPreview>();
    expect(duplicateBody.rows.map((row) => row.feedback)).toEqual([
      [
        "This row is duplicated elsewhere in the CSV.",
        "Email is duplicated by another CSV row.",
      ],
      [
        "This row is duplicated elsewhere in the CSV.",
        "Email is duplicated by another CSV row.",
      ],
    ]);
  });

  it("applies approved valid rows through directory commands once and records exact audit totals", async () => {
    const existing = await addSpeaker(eventId, {
      name: "CSV Update Target",
      email: "csv.update.target@example.test",
      biography: "Before import",
      titleSnapshot: "Principal",
      organizationSnapshot: "Stable Org",
      role: "invited",
      createNewIdentity: true,
    });
    const csvText = [
      "Full Name,Email Address,Bio,Job Title,Company",
      "CSV Created,csv.created@example.test,Created biography,Engineer,Create Org",
      "CSV Update Target,csv.update.target@example.test,After import,Principal,Stable Org",
      "Invalid Row,,Missing email,Director,Invalid Org",
    ].join("\n");
    const previewResponse = await preview(eventId, csvText);
    expect(previewResponse.status).toBe(200);
    const planned = await previewResponse.json<SpeakerCsvImportPreview>();
    expect(planned.rows.map((row) => row.outcome)).toEqual([
      "create",
      "update",
      "invalid",
    ]);

    const request = {
      csvText,
      mapping,
      previewDigest: planned.digest,
      idempotencyKey: "t25-apply-import-once",
      resolutions: {
        "2": { action: "create" },
        "3": { action: "update", speakerId: existing.speaker.speakerId },
        "4": { action: "skip" },
      },
    };
    const appliedResponse = await adminApp.request(
      `https://chartstead.test/api/events/${eventId}/speaker-imports/apply`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": request.idempotencyKey,
        },
        body: JSON.stringify(request),
      },
      env,
    );
    expect(appliedResponse.status).toBe(201);
    const applied = await appliedResponse.json<SpeakerCsvImportApplyResult>();
    expect(applied.totals).toEqual({
      created: 1,
      reused: 0,
      updated: 1,
      skipped: 1,
      invalid: 1,
    });
    expect(applied.rows.map((row) => [row.rowNumber, row.outcome])).toEqual([
      [2, "created"],
      [3, "updated"],
      [4, "skipped"],
    ]);

    const afterFirst = await board();
    expect(afterFirst.speakers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "CSV Created",
          email: "csv.created@example.test",
          titleSnapshot: "Engineer",
          organizationSnapshot: "Create Org",
        }),
        expect.objectContaining({
          speakerId: existing.speaker.speakerId,
          biography: "After import",
          titleSnapshot: "Principal",
          organizationSnapshot: "Stable Org",
        }),
      ]),
    );

    const reappliedResponse = await adminApp.request(
      `https://chartstead.test/api/events/${eventId}/speaker-imports/apply`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": request.idempotencyKey,
        },
        body: JSON.stringify(request),
      },
      env,
    );
    expect(reappliedResponse.status).toBe(200);
    expect(await reappliedResponse.json()).toEqual(applied);
    expect(await board()).toEqual(afterFirst);

    const importedSpeakerId = applied.rows[0]!.speakerId!;
    const taskResponse = await adminApp.request(
      `https://chartstead.test/api/events/${eventId}/onboarding/tasks`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          speakerId: importedSpeakerId,
          title: "Confirm imported profile",
          instructions: "Check the CSV-supplied biography and event details.",
          kind: "profile_confirmation",
          completionRequirement: "manual",
          readinessFlag: "profile_confirmation",
          dueAt: "2026-09-01T00:00:00.000Z",
        }),
      },
      env,
    );
    expect(taskResponse.status).toBe(201);
    const importedAfterTask = (await board()).speakers.find(
      (speaker) => speaker.speakerId === importedSpeakerId,
    );
    expect(importedAfterTask).toMatchObject({
      openTaskCount: 1,
      readinessFlags: ["profile_confirmation"],
      missingWork: [expect.objectContaining({ title: "Confirm imported profile" })],
    });

    const audits = await (
      await adminApp.request(
        `https://chartstead.test/api/events/${eventId}/speaker-imports`,
        undefined,
        env,
      )
    ).json<{ imports: SpeakerCsvImportApplyResult[] }>();
    expect(audits.imports).toHaveLength(1);
    expect(audits.imports[0]).toEqual(applied);
  });

  it("authorizes administrators only and keeps preview identity matching event-scoped", async () => {
    await addSpeaker(eventId, {
      name: "Event Scoped CSV",
      email: "event.scoped.csv@example.test",
      titleSnapshot: "Organizer",
      organizationSnapshot: "First Event",
      role: "invited",
      createNewIdentity: true,
    });
    const csvText = [
      "Full Name,Email Address,Bio,Job Title,Company",
      "Event Scoped CSV,event.scoped.csv@example.test,Bio,Organizer,Second Event",
    ].join("\n");

    const denied = await preview(eventId, csvText, reviewerApp);
    expect(denied.status).toBe(403);

    const otherPreview = await preview(otherEventId, csvText);
    expect(otherPreview.status).toBe(200);
    const other = await otherPreview.json<SpeakerCsvImportPreview>();
    expect(other.rows[0]).toMatchObject({
      outcome: "create",
      matches: [],
      selectedSpeakerId: null,
    });
  });

  it("allows explicit reuse of an unlinked email match or one chosen ambiguous name match", async () => {
    const store = env.EVENT_STORE.getByName(eventId);
    const emailMatchId = await store.upsertSpeakerForTest({
      name: "Unlinked Email Match",
      email: "unlinked.email.match@example.test",
      biography: "Stored biography",
    });
    const firstNameMatchId = await store.upsertSpeakerForTest({
      name: "Ambiguous CSV Name",
      email: "ambiguous.csv.one@example.test",
      biography: "First identity",
    });
    await store.upsertSpeakerForTest({
      name: "Ambiguous CSV Name",
      email: "ambiguous.csv.two@example.test",
      biography: "Second identity",
    });
    const csvText = [
      "Full Name,Email Address,Bio,Job Title,Company",
      "Unlinked Email Match,unlinked.email.match@example.test,Stored biography,Fellow,Email Org",
      "Ambiguous CSV Name,ambiguous.csv.new@example.test,Chosen biography,Director,Name Org",
    ].join("\n");
    const previewResponse = await preview(eventId, csvText);
    expect(previewResponse.status).toBe(200);
    const planned = await previewResponse.json<SpeakerCsvImportPreview>();
    expect(planned.rows[0]).toMatchObject({
      outcome: "reuse",
      selectedSpeakerId: emailMatchId,
    });
    expect(planned.rows[1]).toMatchObject({
      outcome: "invalid",
      selectedSpeakerId: null,
    });
    expect(planned.rows[1].matches).toHaveLength(2);

    const apply = await adminApp.request(
      `https://chartstead.test/api/events/${eventId}/speaker-imports/apply`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "t25-explicit-identity-choice",
        },
        body: JSON.stringify({
          csvText,
          mapping,
          previewDigest: planned.digest,
          idempotencyKey: "t25-explicit-identity-choice",
          resolutions: {
            "2": { action: "reuse", speakerId: emailMatchId },
            "3": { action: "reuse", speakerId: firstNameMatchId },
          },
        }),
      },
      env,
    );
    expect(apply.status).toBe(201);
    const applied = await apply.json<SpeakerCsvImportApplyResult>();
    expect(applied.totals).toEqual({
      created: 0,
      reused: 2,
      updated: 0,
      skipped: 0,
      invalid: 0,
    });
    const after = await board();
    expect(after.speakers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ speakerId: emailMatchId, titleSnapshot: "Fellow" }),
        expect.objectContaining({
          speakerId: firstNameMatchId,
          titleSnapshot: "Director",
        }),
      ]),
    );
  });
});
