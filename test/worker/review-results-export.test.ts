import { env, evictDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import type { OrganizerPrincipal, ReviewResultsResponse } from "../../shared/events";
import { createApp } from "../../worker/app";

const eventId = "pacific-open-data-summit-2026";
const proposalId = "SUB-PODS0048";

const admin = {
  id: "rubric-09-admin",
  displayName: "Rubric 09 Admin",
  role: "admin",
  eventIds: [eventId],
} satisfies OrganizerPrincipal;

const reviewer = {
  id: "rubric-09-reviewer",
  displayName: "Rubric 09 Reviewer",
  role: "reviewer",
  eventIds: [eventId],
  trackIdsByEvent: { [eventId]: ["course-check-demo"] },
} as unknown as OrganizerPrincipal;

const adminApp = createApp({ resolvePrincipal: async () => admin });
const reviewerApp = createApp({ resolvePrincipal: async () => reviewer });

function parseCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index]!;
    const next = csv[index + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }
  if (cell || row.length > 0) rows.push([...row, cell]);
  return rows.filter((candidate) => candidate.some((value) => value.length > 0));
}

function csvRecords(csv: string): Array<Record<string, string>> {
  const [headers = [], ...rows] = parseCsv(csv);
  return rows.map((row) =>
    Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])),
  );
}

describe("review results exports", () => {
  it("aggregates stored review scores, preserves speaker roles, and gates CSV export to admins", async () => {
    const load = await adminApp.request(
      `https://chartstead.test/api/events/${eventId}`,
      undefined,
      env,
    );
    expect(load.status).toBe(200);

    const detail = await reviewerApp.request(
      `https://chartstead.test/api/events/${eventId}/organizer/proposals/${proposalId}`,
      undefined,
      env,
    );
    expect(detail.status).toBe(200);
    const detailBody = await detail.json<{ proposal: { reviewVersion: number } }>();

    const scored = await reviewerApp.request(
      `https://chartstead.test/api/events/${eventId}/organizer/proposals/${proposalId}/review`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expectedVersion: detailBody.proposal.reviewVersion,
          status: "approve",
          criteria: [
            { id: "impact", label: "Impact", value: 4, maxScore: 5, weight: 2 },
            { id: "fit", label: "Program fit", value: 3, maxScore: 5, weight: 1 },
          ],
        }),
      },
      env,
    );
    expect(scored.status).toBe(200);

    const resultsResponse = await adminApp.request(
      `https://chartstead.test/api/events/${eventId}/review-results`,
      undefined,
      env,
    );
    expect(resultsResponse.status).toBe(200);
    const results = await resultsResponse.json<ReviewResultsResponse>();
    const row = results.submissions.find((submission) => submission.proposalId === proposalId);
    expect(row).toMatchObject({
      completionStatus: "complete",
      completedReviewCount: 1,
      totalReviewCount: 1,
      recommendation: "approve",
      aggregateScore: 73.33,
    });
    expect(row?.speakers.map((speaker) => speaker.role)).toEqual([
      "primary",
      "co-speaker",
      "co-speaker",
    ]);
    expect(row?.criteria.map((criterion) => [criterion.id, criterion.value])).toEqual([
      ["impact", 4],
      ["fit", 3],
    ]);

    const store = env.EVENT_STORE.getByName(eventId);
    await evictDurableObject(store);

    const csvResponse = await adminApp.request(
      `https://chartstead.test/api/events/${eventId}/review-results.csv`,
      undefined,
      env,
    );
    expect(csvResponse.status).toBe(200);
    expect(csvResponse.headers.get("content-type")).toContain("text/csv");
    const csvRow = csvRecords(await csvResponse.text()).find(
      (record) => record.proposal_id === proposalId,
    );
    expect(csvRow).toMatchObject({
      proposal_id: proposalId,
      review_completion: "complete",
      completed_reviews: "1",
      total_reviews: "1",
      recommendation: "approve",
      aggregate_score: "73.33",
      "criterion:impact": "4",
      "criterion:fit": "3",
    });
    expect(csvRow?.speakers).toContain("Maya Chen (primary)");
    expect(csvRow?.speakers).toContain("Jordan Blake (co-speaker)");
    expect(csvRow?.speakers).toContain("Casey Ortiz (co-speaker)");
    expect(csvRow?.reviewers).toContain("Rubric 09 Reviewer:complete:approve");

    const forbidden = await reviewerApp.request(
      `https://chartstead.test/api/events/${eventId}/review-results.csv`,
      undefined,
      env,
    );
    expect(forbidden.status).toBe(403);
  });
});
