import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams, useRouterState } from "@tanstack/react-router";
import { Button } from "@base-ui/react/button";

import type { PublicEmbedWidget, PublicProgramFilters } from "../shared/events";
import { isPublicEmbedWidget } from "../shared/public-program";
import { ApiError, fetchPublicEmbed, fetchPublicProgram } from "./api";
import { PublicProgramRenderer } from "./PublicProgramRenderer";
import { demoSpeakerGalleryFixture } from "./demoSpeakerGalleryFixture";

type ProgramSurface = PublicEmbedWidget | "program";

function parseProgramFilters(search: Record<string, unknown>): PublicProgramFilters {
  return {
    query: typeof search.query === "string" ? search.query : undefined,
    day: typeof search.day === "string" ? search.day : undefined,
    trackId: typeof search.trackId === "string" ? search.trackId : undefined,
    roomId: typeof search.roomId === "string" ? search.roomId : undefined,
    format: typeof search.format === "string" ? search.format : undefined,
    speakerId: typeof search.speakerId === "string" ? search.speakerId : undefined,
    role: typeof search.role === "string" ? search.role : undefined,
  };
}

function programSearch(
  revisionId: string | undefined,
  filters: PublicProgramFilters,
  selectedSessionId: string | null,
  widget?: ProgramSurface,
  selectedSpeakerId?: string | null,
  itinerarySessionIds: string[] = [],
  fixture?: string,
) {
  return {
    revision: revisionId,
    widget: widget && widget !== "program" ? widget : undefined,
    query: filters.query,
    day: filters.day,
    trackId: filters.trackId,
    roomId: filters.roomId,
    format: filters.format,
    speakerId: filters.speakerId,
    role: filters.role,
    session: selectedSessionId ?? undefined,
    speaker: selectedSpeakerId ?? undefined,
    itinerary: itinerarySessionIds.length ? itinerarySessionIds.join(",") : undefined,
    fixture,
  };
}

export function PublicProgramPage({
  mode = "page",
  widget,
}: {
  mode?: "page" | "embed";
  widget?: ProgramSurface;
}) {
  const params = useParams({ strict: false }) as { eventId?: string };
  const eventId = params.eventId ?? "";
  const search = useRouterState({ select: (state) => state.location.search }) as Record<
    string,
    unknown
  >;
  const revisionId =
    typeof search.revision === "string" ? search.revision : undefined;
  const searchWidget = isPublicEmbedWidget(search.widget) ? search.widget : undefined;
  const surface = widget ?? searchWidget ?? "program";
  const useSignalRailFixture = surface === "speaker-gallery" && search.fixture === "signal-rail";
  const fixture = typeof search.fixture === "string" ? search.fixture : undefined;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const filters = parseProgramFilters(search);
  const selectedSessionId =
    typeof search.session === "string" ? search.session : null;
  const selectedSpeakerId =
    typeof search.speaker === "string" ? search.speaker : null;
  const itineraryFromUrl = typeof search.itinerary === "string"
    ? Array.from(new Set(search.itinerary.split(",").map((id) => id.trim()).filter(Boolean)))
    : [];
  const itineraryStorageKey = `chartstead:itinerary:${eventId}:${revisionId ?? "current"}`;
  const itinerary = useQuery({
    queryKey: ["public-itinerary", eventId, revisionId ?? "current"],
    queryFn: () => {
      if (itineraryFromUrl.length) return itineraryFromUrl;
      try { return JSON.parse(localStorage.getItem(itineraryStorageKey) ?? "[]") as string[]; }
      catch { return []; }
    },
    initialData: () => {
      if (itineraryFromUrl.length) return itineraryFromUrl;
      try { return JSON.parse(localStorage.getItem(itineraryStorageKey) ?? "[]") as string[]; }
      catch { return []; }
    },
    staleTime: Infinity,
  });

  const updateProgramSearch = (
    nextFilters: PublicProgramFilters,
    nextSessionId: string | null = null,
    nextSpeakerId: string | null = null,
    nextItinerarySessionIds = itinerary.data,
  ) => {
    const nextSearch = programSearch(
      revisionId,
      nextFilters,
      nextSessionId,
      surface,
      nextSpeakerId,
      nextItinerarySessionIds,
      fixture,
    );
    if (mode === "embed") {
      void navigate({
        to: "/e/$eventId/program/embed",
        params: { eventId },
        search: nextSearch,
        resetScroll: false,
        replace: true,
      });
      return;
    }
    void navigate({
      to: "/e/$eventId/program",
      params: { eventId },
      search: nextSearch,
      resetScroll: false,
      replace: true,
    });
  };

  const itineraryMutation = useMutation({
    mutationFn: async (nextIds: string[]) => {
      localStorage.setItem(itineraryStorageKey, JSON.stringify(nextIds));
      return nextIds;
    },
    onMutate: async (nextIds) => {
      const key = ["public-itinerary", eventId, revisionId ?? "current"] as const;
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<string[]>(key) ?? [];
      queryClient.setQueryData(key, nextIds);
      updateProgramSearch(filters, selectedSessionId, selectedSpeakerId, nextIds);
      return { previous, key };
    },
    onError: (_error, _nextIds, context) => {
      if (context) {
        queryClient.setQueryData(context.key, context.previous);
        updateProgramSearch(filters, selectedSessionId, selectedSpeakerId, context.previous);
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["public-itinerary", eventId] }),
  });

  const program = useQuery({
    queryKey: ["public-program", eventId, revisionId ?? "current"],
    queryFn: () => fetchPublicProgram(eventId, revisionId),
  });

  if (program.isPending) {
    return (
      <main className={`program-shell mode-${mode}`} aria-busy="true">
        <p>Loading public program…</p>
      </main>
    );
  }

  if (program.isError) {
    return (
      <main className={`program-shell mode-${mode}`}>
        <section className="error-panel" role="alert">
          <h1>Program unavailable</h1>
          <p>
            {program.error instanceof ApiError
              ? program.error.message
              : "Unable to load the public program."}
          </p>
          <Button type="button" onClick={() => void program.refetch()}>Try again</Button>
          {mode === "page" ? <Link to="/">Return to ChartStead</Link> : null}
        </section>
      </main>
    );
  }

  return (
    <main className={`program-shell mode-${mode}`}>
      <PublicProgramRenderer
        data={useSignalRailFixture ? demoSpeakerGalleryFixture : program.data}
        mode={mode}
        widget={surface}
        filters={filters}
        onFiltersChange={(nextFilters) => updateProgramSearch(nextFilters, null, null)}
        selectedSessionId={selectedSessionId}
        onSelectSession={(sessionId) => updateProgramSearch(filters, sessionId, null)}
        selectedSpeakerId={selectedSpeakerId}
        onSelectSpeaker={(speakerId) => updateProgramSearch(filters, null, speakerId)}
        itinerarySessionIds={itinerary.data}
        onItinerarySessionIdsChange={(sessionIds) => itineraryMutation.mutate(sessionIds)}
        itineraryPending={itineraryMutation.isPending}
        itineraryError={itineraryMutation.isError ? "We couldn't save that itinerary change." : null}
      />
      {surface !== "itinerary" ? (
        <footer className="program-footer">
          <p>Powered by ChartStead</p>
          {mode === "page" ? (
            <p>
              <Link
                to="/e/$eventId/program/embed"
                params={{ eventId }}
                search={programSearch(revisionId, filters, selectedSessionId, surface, selectedSpeakerId, itinerary.data, fixture)}
              >
                Embed view
              </Link>
            </p>
          ) : null}
        </footer>
      ) : null}
    </main>
  );
}

export function PublicProgramEmbedPage() {
  return <PublicProgramPage mode="embed" />;
}

export function PublicSessionsPage() {
  return <PublicProgramPage widget="sessions" />;
}

export function PublicSpeakersPage() {
  return <PublicProgramPage widget="speakers" />;
}

export function PublicAgendaPage() {
  return <PublicProgramPage widget="agenda" />;
}

export function PublicItineraryPage() {
  return <PublicProgramPage widget="itinerary" />;
}

export function PublicSpeakerGalleryPage() {
  return <PublicProgramPage widget="speaker-gallery" />;
}

export function PublicManagedEmbedPage() {
  const params = useParams({ strict: false }) as { eventId?: string; embedId?: string };
  const eventId = params.eventId ?? "";
  const embedId = params.embedId ?? "";
  const embed = useQuery({
    queryKey: ["public-embed", eventId, embedId],
    queryFn: () => fetchPublicEmbed(eventId, embedId),
  });

  if (embed.isPending) {
    return (
      <main className="program-shell mode-embed" aria-busy="true">
        <p>Loading public embed…</p>
      </main>
    );
  }

  if (embed.isError) {
    return (
      <main className="program-shell mode-embed">
        <section className="error-panel" role="alert">
          <h1>Embed unavailable</h1>
          <p>
            {embed.error instanceof ApiError
              ? embed.error.message
              : "Unable to load the public embed."}
          </p>
          <Button type="button" onClick={() => void embed.refetch()}>Try again</Button>
        </section>
      </main>
    );
  }

  return (
    <main className="program-shell mode-embed managed-embed-shell">
      <PublicProgramRenderer
        data={embed.data.program}
        mode="embed"
        widget={embed.data.config.widget}
        theme={embed.data.config.theme}
        fieldVisibility={embed.data.config.fields}
      />
      <footer className="program-footer">
        <p>Powered by ChartStead</p>
      </footer>
    </main>
  );
}
