import type { AirtableRecord } from "../../shared/airtable";
import type { OrganizerProposal } from "../../shared/events";
import type { EventStore } from "../event-store";
import { createMemoryAirtableClient, type AirtableClient } from "./client";

/** Magic credentials for human QA without a real Airtable account. */
export const DEMO_AIRTABLE_BASE_ID = "appChartSteadDemo";
export const DEMO_AIRTABLE_ACCESS_TOKEN = "pat_demo_sandbox";

export function isDemoAirtableSandbox(creds: {
  baseId: string;
  accessToken: string;
}): boolean {
  return (
    creds.baseId.trim() === DEMO_AIRTABLE_BASE_ID &&
    creds.accessToken.trim() === DEMO_AIRTABLE_ACCESS_TOKEN
  );
}

/**
 * Builds a fake Airtable base from current ChartStead rows so pull applies a
 * visible mapped-field change (title suffix) without touching committee notes.
 */
export async function createDemoSandboxAirtableClient(
  store: DurableObjectStub<EventStore>,
): Promise<AirtableClient> {
  const proposals = (await store.listProposals({})) as OrganizerProposal[];
  const speakers = await store.listApiSpeakers();
  const agenda = await store.getAgendaWorkspace();
  const tasks = await store.listApiTasks();
  const event = await store.getEvent();

  const submissionRecords: AirtableRecord[] = proposals.slice(0, 3).map((proposal, index) => ({
    id: `recDemoSub${index + 1}`,
    fields: {
      "ChartStead Submission ID": proposal.id,
      Title: `${proposal.title.replace(/ \(from Airtable demo\)$/, "")} (from Airtable demo)`,
      Abstract: proposal.abstract,
      "Track ID": proposal.trackId,
      "Speaker Name": proposal.speakerName,
      "Speaker Email": proposal.speakerEmail,
      Biography: proposal.biography,
      "Supporting Link": proposal.supportingLink || "https://example.com/demo-from-airtable",
    },
  }));

  const speakerRecords: AirtableRecord[] = speakers.slice(0, 3).map((speaker, index) => ({
    id: `recDemoSpk${index + 1}`,
    fields: {
      "ChartStead Speaker ID": speaker.id,
      Name: speaker.name,
      Email: speaker.email,
      Biography:
        speaker.biography?.trim() ||
        "Biography updated from the ChartStead demo Airtable sandbox.",
    },
  }));

  const sessionRecords: AirtableRecord[] = (agenda.sessions ?? [])
    .slice(0, 3)
    .map((session, index) => ({
      id: `recDemoSess${index + 1}`,
      fields: {
        "ChartStead Session ID": session.id,
        Title: session.title,
        Format: session.format,
        "Track ID": session.trackId,
        "Room ID": session.roomId,
        "Starts At": session.startsAt,
        "Ends At": session.endsAt,
      },
    }));

  const taskRecords: AirtableRecord[] = tasks.slice(0, 3).map((task, index) => ({
    id: `recDemoTask${index + 1}`,
    fields: {
      "ChartStead Task ID": task.id,
      Title: task.title,
      Instructions: task.instructions,
      "Due At": task.dueAt,
      Status: task.status,
    },
  }));

  const eventRecords: AirtableRecord[] = event
    ? [
        {
          id: "recDemoEvent1",
          fields: {
            "ChartStead Event ID": event.id,
            Name: event.name,
            "Starts On": event.startsOn,
            "Ends On": event.endsOn,
          },
        },
      ]
    : [];

  return createMemoryAirtableClient({
    event: eventRecords,
    submission: submissionRecords,
    speaker: speakerRecords,
    session: sessionRecords,
    task: taskRecords,
  });
}
