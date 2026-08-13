import type { EventRecord } from "../shared/events";

function submissionsHref(eventId: string, search = "") {
  return `/e/${eventId}/submissions${search}`;
}

export function OverviewWorkspace({ event }: { event: EventRecord }) {
  const pendingRooms = event.rooms.filter((room) => room.readiness !== "ready");
  const attention = [
    event.unreviewedCount > 0
      ? {
          href: submissionsHref(event.id, "?status=unreviewed"),
          title:
            event.unreviewedCount === 1
              ? "1 proposal is still unreviewed"
              : `${event.unreviewedCount} proposals are still unreviewed`,
          detail: "Open the review queue",
        }
      : null,
    event.tracks.length === 0
      ? {
          href: `/e/${event.id}/settings`,
          title: "No tracks configured yet",
          detail: "Add tracks in Settings",
        }
      : null,
    event.rooms.length === 0
      ? {
          href: `/e/${event.id}/settings`,
          title: "No rooms configured yet",
          detail: "Add rooms in Settings",
        }
      : pendingRooms.length > 0
        ? {
            href: `/e/${event.id}/settings`,
            title:
              pendingRooms.length === 1
                ? "1 room is still pending"
                : `${pendingRooms.length} rooms are still pending`,
            detail: "Finish room setup in Settings",
          }
        : null,
  ].filter((item): item is NonNullable<typeof item> => item !== null);

  return (
    <div className="workspace overview-workspace">
      <section className="overview-metrics" aria-label="Event counts">
        <a
          className="overview-metric"
          href={submissionsHref(event.id, "?status=unreviewed")}
          aria-label={`${event.unreviewedCount} unreviewed`}
          data-tone={event.unreviewedCount > 0 ? "attention" : undefined}
        >
          <strong>{event.unreviewedCount}</strong>
          <span>unreviewed</span>
        </a>
        <a
          className="overview-metric"
          href={submissionsHref(event.id)}
          aria-label={`${event.submissionCount} submissions`}
        >
          <strong>{event.submissionCount}</strong>
          <span>submissions</span>
        </a>
        <div className="overview-metric" aria-label={`${event.tracks.length} tracks`}>
          <strong>{event.tracks.length}</strong>
          <span>tracks</span>
        </div>
        <div className="overview-metric" aria-label={`${event.rooms.length} rooms`}>
          <strong>{event.rooms.length}</strong>
          <span>rooms</span>
        </div>
      </section>

      <section className="operations-panel overview-attention" aria-labelledby="overview-attention-title">
        <div className="panel-heading">
          <h2 id="overview-attention-title">Needs attention</h2>
          <span>
            {attention.length === 0
              ? "Nothing blocking"
              : `${attention.length} open`}
          </span>
        </div>
        {attention.length === 0 ? (
          <p className="empty-state padded">
            No setup or review work is waiting. Continue in Submissions, Speakers, or Agenda.
          </p>
        ) : (
          <ul className="overview-action-list">
            {attention.map((item) => (
              <li key={item.title}>
                <a href={item.href}>
                  <strong>{item.title}</strong>
                  <span>{item.detail}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="operations-grid">
        <section className="operations-panel" aria-labelledby="tracks-title">
          <div className="panel-heading">
            <h2 id="tracks-title">Tracks</h2>
            <span>{event.tracks.length === 0 ? "Not configured" : `${event.tracks.length} active`}</span>
          </div>
          {event.tracks.length === 0 ? (
            <p className="empty-state padded">
              Add tracks in Settings so proposals can be reviewed by program area.{" "}
              <a href={`/e/${event.id}/settings`}>Open Settings</a>
            </p>
          ) : (
            <ul className="operation-list">
              {event.tracks.map((track, index) => (
                <li key={track.id}>
                  <span className={`track-line track-${index + 1}`} aria-hidden="true" />
                  <a href={submissionsHref(event.id, `?track=${encodeURIComponent(track.id)}`)}>
                    <strong>{track.name}</strong>
                  </a>
                  <span>
                    {track.proposalCount === 1 ? "1 proposal" : `${track.proposalCount} proposals`}
                  </span>
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
              Add rooms in Settings before placing the agenda.{" "}
              <a href={`/e/${event.id}/settings`}>Open Settings</a>
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
