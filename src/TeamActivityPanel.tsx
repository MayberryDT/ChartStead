import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import type { OrganizerTeamActivityEntry } from "../shared/events";
import { fetchOrganizerActivityByActor } from "./api";
import { SettingsSelectField } from "./SettingsFields";

const PAGE_SIZE = 50;

function formatWhen(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function ActivityEntryLink({
  eventId,
  entry,
  children,
}: {
  eventId: string;
  entry: OrganizerTeamActivityEntry;
  children: ReactNode;
}) {
  if (entry.proposalId) {
    return (
      <Link
        to="/e/$eventId/submissions/$proposalId"
        params={{ eventId, proposalId: entry.proposalId }}
      >
        {children}
      </Link>
    );
  }
  if (entry.speakerId) {
    return (
      <Link to="/e/$eventId/speakers" params={{ eventId }}>
        {children}
      </Link>
    );
  }
  if (entry.planId) {
    return (
      <Link
        to="/e/$eventId/course-checks/$planId"
        params={{ eventId, planId: entry.planId }}
      >
        {children}
      </Link>
    );
  }
  if (entry.domain === "agenda") {
    return (
      <Link to="/e/$eventId/agenda" params={{ eventId }}>
        {children}
      </Link>
    );
  }
  if (entry.domain === "evaluation") {
    return (
      <Link to="/e/$eventId/settings" params={{ eventId }}>
        {children}
      </Link>
    );
  }
  return <strong>{children}</strong>;
}

export function TeamActivityPanel({ eventId }: { eventId: string }) {
  const [actorId, setActorId] = useState("");

  const actorsQuery = useQuery({
    queryKey: ["organizer-activity-actors", eventId],
    queryFn: () => fetchOrganizerActivityByActor(eventId, null),
  });

  const activityQuery = useInfiniteQuery({
    queryKey: ["organizer-activity", eventId, actorId],
    enabled: Boolean(actorId),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      fetchOrganizerActivityByActor(eventId, actorId, {
        limit: PAGE_SIZE,
        before: pageParam,
      }),
    getNextPageParam: (lastPage) => {
      if (!lastPage.hasMore || lastPage.entries.length === 0) return undefined;
      return lastPage.entries[lastPage.entries.length - 1]!.createdAt;
    },
  });

  const actors = actorsQuery.data?.actors ?? [];
  const actorOptions = useMemo(
    () =>
      actors.map((member) => ({
        value: member.id,
        label: member.name,
      })),
    [actors],
  );

  useEffect(() => {
    if (!actors.length) return;
    if (actorId && actors.some((member) => member.id === actorId)) return;
    setActorId(actors[0]!.id);
  }, [actors, actorId]);

  const entries = useMemo(
    () => activityQuery.data?.pages.flatMap((page) => page.entries) ?? [],
    [activityQuery.data],
  );

  return (
    <section className="settings-card settings-card-compact" aria-label="Activity">
      <h2>Activity</h2>

      {actorsQuery.isError || activityQuery.isError ? (
        <p className="form-message error" role="alert">
          {(actorsQuery.error ?? activityQuery.error) instanceof Error
            ? ((actorsQuery.error ?? activityQuery.error) as Error).message
            : "Unable to load activity."}
        </p>
      ) : null}

      {actorOptions.length > 0 ? (
        <SettingsSelectField
          label="Team member"
          value={actorId || actorOptions[0]!.value}
          options={actorOptions}
          onChange={setActorId}
        />
      ) : null}

      {actorsQuery.isLoading || (actorId && activityQuery.isLoading) ? (
        <p className="muted">Loading…</p>
      ) : null}

      {actorId && !activityQuery.isLoading && entries.length === 0 ? (
        <p className="muted" role="status">
          No activity.
        </p>
      ) : null}

      {entries.length > 0 ? (
        <ol className="team-activity-list">
          {entries.map((entry) => (
            <li key={entry.id}>
              <div className="team-activity-main">
                <ActivityEntryLink eventId={eventId} entry={entry}>
                  {entry.summary}
                </ActivityEntryLink>
                <span>{entry.label}</span>
                <span className="muted team-activity-actor">{entry.actorName}</span>
              </div>
              <time dateTime={entry.createdAt}>{formatWhen(entry.createdAt)}</time>
            </li>
          ))}
        </ol>
      ) : null}

      {activityQuery.hasNextPage ? (
        <button
          type="button"
          className="btn btn-secondary btn-sm team-activity-more"
          disabled={activityQuery.isFetchingNextPage}
          onClick={() => {
            void activityQuery.fetchNextPage();
          }}
        >
          {activityQuery.isFetchingNextPage ? "Loading…" : "Load more"}
        </button>
      ) : null}
    </section>
  );
}
