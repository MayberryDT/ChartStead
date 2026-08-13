import { useQuery } from "@tanstack/react-query";

import type { EventRecord } from "../shared/events";
import { fetchAgenda, fetchOnboardingBoard, fetchOrganizerForms } from "./api";

type AttentionItem = {
  key: string;
  title: string;
  detail: string;
  href: string;
};

function countLabel(count: number, singular: string, plural: string) {
  return count === 1 ? `1 ${singular}` : `${count} ${plural}`;
}

export function OverviewWorkspace({ event }: { event: EventRecord }) {
  const agenda = useQuery({
    queryKey: ["overview-agenda", event.id],
    queryFn: () => fetchAgenda(event.id),
    retry: false,
  });
  const onboarding = useQuery({
    queryKey: ["overview-onboarding", event.id],
    queryFn: () => fetchOnboardingBoard(event.id),
    retry: false,
  });
  const forms = useQuery({
    queryKey: ["overview-forms", event.id],
    queryFn: () => fetchOrganizerForms(event.id),
    retry: false,
  });

  const pendingRooms = event.rooms.filter((room) => room.readiness !== "ready");
  const unplaced = agenda.data ? agenda.data.counts.unplaced + agenda.data.counts.partial : null;
  const conflicts = agenda.data?.counts.conflicts ?? 0;
  const speakersNeedingWork = onboarding.data
    ? onboarding.data.speakers.filter((speaker) => speaker.openTaskCount > 0).length
    : null;
  const speakersOverdue = onboarding.data
    ? onboarding.data.speakers.filter((speaker) => speaker.overdueCount > 0).length
    : 0;
  const publishedForms = forms.data?.filter((form) => form.lifecycleStatus === "published") ?? [];
  const closedForms = forms.data?.filter((form) => form.lifecycleStatus === "closed") ?? [];

  const attention: AttentionItem[] = [];
  if (event.unreviewedCount > 0) {
    attention.push({
      key: "unreviewed",
      href: `/e/${event.id}/submissions?status=unreviewed`,
      title: `${countLabel(event.unreviewedCount, "proposal is", "proposals are")} still unreviewed`,
      detail: "Review queue",
    });
  }
  if (forms.data && publishedForms.length === 0 && closedForms.length === 0) {
    attention.push({
      key: "cfp",
      href: `/e/${event.id}/forms`,
      title: "No CFP is published yet",
      detail: "Forms",
    });
  }
  if (event.tracks.length === 0) {
    attention.push({
      key: "tracks",
      href: `/e/${event.id}/settings`,
      title: "No tracks configured yet",
      detail: "Settings",
    });
  }
  if (event.rooms.length === 0) {
    attention.push({
      key: "rooms",
      href: `/e/${event.id}/settings`,
      title: "No rooms configured yet",
      detail: "Settings",
    });
  } else if (pendingRooms.length > 0) {
    attention.push({
      key: "pending-rooms",
      href: `/e/${event.id}/settings`,
      title: `${countLabel(pendingRooms.length, "room is", "rooms are")} still pending`,
      detail: "Settings",
    });
  }
  if (unplaced && unplaced > 0) {
    attention.push({
      key: "unplaced",
      href: `/e/${event.id}/agenda`,
      title: `${countLabel(unplaced, "session is", "sessions are")} still unplaced`,
      detail: "Agenda",
    });
  }
  if (agenda.data && conflicts > 0) {
    attention.push({
      key: "conflicts",
      href: `/e/${event.id}/agenda`,
      title: `${countLabel(conflicts, "schedule conflict needs", "schedule conflicts need")} a look`,
      detail: "Agenda",
    });
  }
  if (speakersOverdue > 0) {
    attention.push({
      key: "overdue",
      href: `/e/${event.id}/speakers`,
      title: `${countLabel(speakersOverdue, "speaker is", "speakers are")} overdue`,
      detail: "Speakers",
    });
  } else if (speakersNeedingWork && speakersNeedingWork > 0) {
    attention.push({
      key: "speakers",
      href: `/e/${event.id}/speakers`,
      title: `${countLabel(speakersNeedingWork, "speaker still has", "speakers still have")} open work`,
      detail: "Speakers",
    });
  }

  return (
    <div className="workspace overview-workspace">
      <section className="overview-metrics" aria-label="Event counts">
        <a
          className="overview-metric"
          href={`/e/${event.id}/submissions?status=unreviewed`}
          aria-label={`${event.unreviewedCount} unreviewed`}
          data-tone={event.unreviewedCount > 0 ? "attention" : undefined}
        >
          <strong>{event.unreviewedCount}</strong>
          <span>unreviewed</span>
        </a>
        <a
          className="overview-metric"
          href={`/e/${event.id}/submissions`}
          aria-label={`${event.submissionCount} submissions`}
        >
          <strong>{event.submissionCount}</strong>
          <span>submissions</span>
        </a>
        <a
          className="overview-metric"
          href={`/e/${event.id}/agenda`}
          aria-label={unplaced === null ? "Unplaced sessions loading" : `${unplaced} unplaced`}
          data-tone={unplaced && unplaced > 0 ? "attention" : undefined}
        >
          <strong>{unplaced === null ? "—" : unplaced}</strong>
          <span>unplaced</span>
        </a>
        <a
          className="overview-metric"
          href={`/e/${event.id}/speakers`}
          aria-label={
            speakersNeedingWork === null
              ? "Speaker work loading"
              : `${speakersNeedingWork} speakers with open work`
          }
          data-tone={speakersNeedingWork && speakersNeedingWork > 0 ? "attention" : undefined}
        >
          <strong>{speakersNeedingWork === null ? "—" : speakersNeedingWork}</strong>
          <span>speaker work</span>
        </a>
      </section>

      <section className="operations-panel overview-attention" aria-labelledby="overview-attention-title">
        <div className="panel-heading">
          <h2 id="overview-attention-title">Needs attention</h2>
          <span>{attention.length === 0 ? "Nothing waiting" : `${attention.length} open`}</span>
        </div>
        {attention.length === 0 ? (
          <p className="empty-state padded">
            Nothing is waiting on this event. Continue in Submissions, Speakers, or Agenda.
          </p>
        ) : (
          <ul className="overview-action-list">
            {attention.map((item) => (
              <li key={item.key}>
                <a href={item.href}>
                  <strong>{item.title}</strong>
                  <span>{item.detail}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="operations-grid overview-inventory">
        <section className="operations-panel" aria-labelledby="tracks-title">
          <div className="panel-heading">
            <h2 id="tracks-title">Tracks</h2>
            <span>{event.tracks.length === 0 ? "Not configured" : `${event.tracks.length} active`}</span>
          </div>
          {event.tracks.length === 0 ? (
            <p className="empty-state padded">
              No tracks configured yet. <a href={`/e/${event.id}/settings`}>Add tracks in Settings</a>
            </p>
          ) : (
            <ul className="operation-list">
              {event.tracks.map((track, index) => (
                <li key={track.id}>
                  <span className={`track-line track-${index + 1}`} aria-hidden="true" />
                  <a href={`/e/${event.id}/submissions?track=${encodeURIComponent(track.id)}`}>
                    <strong>{track.name}</strong>
                  </a>
                  <span>{countLabel(track.proposalCount, "proposal", "proposals")}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="operations-panel" aria-labelledby="rooms-title">
          <div className="panel-heading">
            <h2 id="rooms-title">Rooms</h2>
            <span>
              {event.rooms.length === 0
                ? "Not configured"
                : pendingRooms.length > 0
                  ? `${pendingRooms.length} pending`
                  : `${event.rooms.length} ready`}
            </span>
          </div>
          {event.rooms.length === 0 ? (
            <p className="empty-state padded">
              No rooms configured yet. <a href={`/e/${event.id}/settings`}>Add rooms in Settings</a>
            </p>
          ) : (
            <ul className="operation-list">
              {event.rooms.map((room, index) => (
                <li key={room.id}>
                  <span className="room-index">{String(index + 1).padStart(2, "0")}</span>
                  <strong>{room.name}</strong>
                  <span data-tone={room.readiness === "ready" ? undefined : "attention"}>
                    {room.readiness === "ready" ? "Ready" : "Pending"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
