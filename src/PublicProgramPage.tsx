import { useQuery } from "@tanstack/react-query";
import { Link, useParams, useSearch } from "@tanstack/react-router";

import markOnLightUrl from "../design/assets/brand/chartstead-mark-on-light.png";
import { ApiError, fetchPublicProgram } from "./api";
import { PublicProgramRenderer } from "./PublicProgramRenderer";

export function PublicProgramPage({ mode = "page" }: { mode?: "page" | "embed" }) {
  const { eventId } = useParams({
    from: mode === "embed" ? "/e/$eventId/program/embed" : "/e/$eventId/program",
  });
  const search = useSearch({
    from: mode === "embed" ? "/e/$eventId/program/embed" : "/e/$eventId/program",
  });
  const revisionId =
    typeof search.revision === "string" ? search.revision : undefined;

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
          {mode === "page" ? <Link to="/">Return to ChartStead</Link> : null}
        </section>
      </main>
    );
  }

  return (
    <main className={`program-shell mode-${mode}`}>
      {mode === "page" ? (
        <div className="program-brand">
          <img src={markOnLightUrl} width="40" height="40" alt="" />
        </div>
      ) : null}
      <PublicProgramRenderer data={program.data} mode={mode} />
      <footer className="program-footer">
        <p>Powered by ChartStead</p>
        {mode === "page" ? (
          <p>
            <Link
              to="/e/$eventId/program/embed"
              params={{ eventId }}
              search={{ revision: revisionId }}
            >
              Embed view
            </Link>
          </p>
        ) : null}
      </footer>
    </main>
  );
}

export function PublicProgramEmbedPage() {
  return <PublicProgramPage mode="embed" />;
}
