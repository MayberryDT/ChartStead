import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";

import { fetchSpeakerPortalSession } from "./api";

function formatWhen(value: string | null | undefined): string {
  if (!value) return "TBD";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function SpeakerPortalPage() {
  const { eventId, token } = useParams({ from: "/e/$eventId/portal/$token" });
  const session = useQuery({
    queryKey: ["speaker-portal", eventId, token],
    queryFn: () => fetchSpeakerPortalSession(eventId, token),
    retry: false,
  });

  if (session.isPending) {
    return (
      <main className="portal-shell" aria-busy="true">
        <p>Opening your speaker portal…</p>
      </main>
    );
  }

  if (session.isError) {
    return (
      <main className="portal-shell">
        <section className="error-panel" role="alert">
          <h1>Portal link unavailable</h1>
          <p>{session.error.message}</p>
          <p>Invalid, expired, or revoked links never expose speaker details.</p>
          <Link className="primary-action" to="/">
            Go to ChartStead
          </Link>
        </section>
      </main>
    );
  }

  const data = session.data;
  const openTasks = data.tasks.filter((task) => task.status === "open");
  const doneTasks = data.tasks.filter((task) => task.status !== "open");
  const progress =
    data.tasks.length === 0
      ? 100
      : Math.round((doneTasks.length / data.tasks.length) * 100);

  return (
    <main className="portal-shell">
      <header className="portal-header">
        <p className="eyebrow">Speaker portal</p>
        <h1>{data.eventName}</h1>
        <p>
          Welcome, {data.profile.name}. Your acceptance state is{" "}
          <strong>{data.acceptanceState ?? "pending"}</strong>.
        </p>
      </header>

      <section className="portal-summary" aria-label="Portal summary">
        <article className="portal-card">
          <h2>Tasks</h2>
          <p className="portal-metric">
            {openTasks.length} open · {progress}% complete
          </p>
          <p className="portal-muted">
            Next deadline: {formatWhen(data.nextDeadline)}
          </p>
        </article>
        <article className="portal-card">
          <h2>Acceptance</h2>
          <p className="portal-metric">{data.acceptanceState ?? "—"}</p>
          {data.proposal ? (
            <p className="portal-muted">
              {data.proposal.id} · {data.proposal.title}
            </p>
          ) : (
            <p className="portal-muted">Direct program placement</p>
          )}
        </article>
        <article className="portal-card">
          <h2>Session</h2>
          {data.session ? (
            <>
              <p className="portal-metric">{data.session.title}</p>
              <p className="portal-muted">
                {data.session.format || "Session"} ·{" "}
                {formatWhen(data.session.startsAt)} ·{" "}
                {data.session.roomId ? `Room ${data.session.roomId}` : "Room TBD"}
              </p>
            </>
          ) : (
            <p className="portal-muted">No session yet</p>
          )}
        </article>
      </section>

      <div className="portal-grid">
        <section className="portal-card" aria-labelledby="profile-title">
          <h2 id="profile-title">Current profile</h2>
          <p className="portal-muted">
            This is your living speaker identity across events.
          </p>
          <dl className="portal-dl">
            <div>
              <dt>Name</dt>
              <dd>{data.profile.name}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{data.profile.email}</dd>
            </div>
            <div>
              <dt>Biography</dt>
              <dd>{data.profile.biography || "Not provided yet"}</dd>
            </div>
          </dl>
        </section>

        <section className="portal-card" aria-labelledby="participation-title">
          <h2 id="participation-title">This event</h2>
          <p className="portal-muted">
            Snapshot captured for this event’s program history.
          </p>
          <dl className="portal-dl">
            <div>
              <dt>Role</dt>
              <dd>{data.participation.role}</dd>
            </div>
            <div>
              <dt>Title at event</dt>
              <dd>{data.participation.titleAtEvent || "—"}</dd>
            </div>
            <div>
              <dt>Organization at event</dt>
              <dd>{data.participation.organizationAtEvent || "—"}</dd>
            </div>
          </dl>
        </section>

        <section className="portal-card portal-span" aria-labelledby="tasks-title">
          <h2 id="tasks-title">Onboarding tasks</h2>
          {openTasks.length === 0 ? (
            <p className="portal-muted">No open tasks right now.</p>
          ) : (
            <ul className="portal-task-list">
              {openTasks.map((task) => (
                <li key={task.id}>
                  <div>
                    <strong>{task.title}</strong>
                    <span className="portal-muted"> · due {formatWhen(task.dueAt)}</span>
                  </div>
                  <span className="portal-chip">{task.status}</span>
                </li>
              ))}
            </ul>
          )}
          {doneTasks.length > 0 ? (
            <details className="portal-history">
              <summary>Completed ({doneTasks.length})</summary>
              <ul className="portal-task-list">
                {doneTasks.map((task) => (
                  <li key={task.id}>
                    <strong>{task.title}</strong>
                    <span className="portal-chip">{task.status}</span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </section>
      </div>

      <p className="portal-footer">Powered by ChartStead</p>
    </main>
  );
}
