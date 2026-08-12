import { Button } from "@base-ui/react/button";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import markOnLightUrl from "../design/assets/brand/chartstead-mark-on-light.png";

interface DemoPersona {
  id: "organizer" | "track-reviewer" | "accepted-speaker";
  role: "admin" | "reviewer" | "speaker";
  label: string;
  description: string;
}

interface DemoPersonaDirectory {
  event: { id: string; name: string };
  personas: DemoPersona[];
}

async function responseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response
      .json<{ error?: string }>()
      .catch((): { error?: string } => ({}));
    throw new Error(body.error ?? "The demo journey could not be opened.");
  }
  return response.json<T>();
}

async function fetchDemoPersonas(): Promise<DemoPersonaDirectory> {
  return responseJson(await fetch("/api/demo/personas"));
}

async function enterDemoPersona(personaId: DemoPersona["id"]): Promise<{ path: string }> {
  return responseJson(
    await fetch(`/api/demo/personas/${personaId}/enter`, { method: "POST" }),
  );
}

async function resetDemoPersonas(): Promise<void> {
  await responseJson(
    await fetch("/api/demo/personas/reset", { method: "POST" }),
  );
}

export function DemoPersonasPage({
  navigateTo = (path) => window.location.assign(path),
}: {
  navigateTo?: (path: string) => void;
}) {
  const [entering, setEntering] = useState<DemoPersona["id"] | null>(null);
  const directory = useQuery({
    queryKey: ["demo-personas"],
    queryFn: fetchDemoPersonas,
    retry: false,
  });
  const enter = useMutation({
    mutationFn: enterDemoPersona,
    onSuccess: ({ path }) => navigateTo(path),
    onSettled: () => setEntering(null),
  });
  const reset = useMutation({ mutationFn: resetDemoPersonas });

  return (
    <main className="sign-in-shell demo-persona-shell">
      <section className="sign-in-panel demo-persona-panel" aria-labelledby="demo-persona-title">
        <header className="demo-persona-header">
          <img src={markOnLightUrl} width="48" height="48" alt="" />
          <div>
            <p className="eyebrow">ChartStead evaluator demo</p>
            <h1 id="demo-persona-title">Choose an evaluator journey</h1>
          </div>
        </header>
        <p className="demo-persona-intro">
          Explore the same role boundaries used by the product with isolated demo data. No inbox or account setup is required.
        </p>

        {directory.isPending ? <p role="status">Preparing evaluator journeys…</p> : null}
        {directory.isError ? (
          <p className="form-message" data-tone="error" role="alert">
            {directory.error.message}
          </p>
        ) : null}
        {directory.data ? (
          <>
            <p className="demo-persona-event">Seeded event: <strong>{directory.data.event.name}</strong></p>
            <div className="demo-persona-grid">
              {directory.data.personas.map((persona) => (
                <article className="demo-persona-card" key={persona.id}>
                  <p className="demo-persona-role">{persona.role === "admin" ? "Full event desk" : persona.role === "reviewer" ? "Platform track only" : "Signed link only"}</p>
                  <h2>{persona.label}</h2>
                  <p>{persona.description}</p>
                  <Button
                    className="primary-action"
                    disabled={enter.isPending || reset.isPending}
                    focusableWhenDisabled
                    onClick={() => {
                      setEntering(persona.id);
                      enter.mutate(persona.id);
                    }}
                  >
                    {entering === persona.id ? "Opening…" : `Enter as ${persona.label.toLowerCase()}`}
                  </Button>
                </article>
              ))}
            </div>
          </>
        ) : null}

        <footer className="demo-persona-reset">
          <div>
            <h2>Start from the seeded state</h2>
            <p>Reset restores only the reviewer decision and accepted-speaker profile, tasks, and uploads.</p>
          </div>
          <Button
            className="secondary-action"
            disabled={reset.isPending || enter.isPending}
            focusableWhenDisabled
            onClick={() => reset.mutate()}
          >
            {reset.isPending ? "Resetting…" : "Reset evaluator data"}
          </Button>
        </footer>
        {reset.isSuccess ? <p role="status">Reviewer and speaker demo data restored.</p> : null}
        {enter.isError || reset.isError ? (
          <p className="form-message" data-tone="error" role="alert">
            {(enter.error ?? reset.error)?.message}
          </p>
        ) : null}
      </section>
    </main>
  );
}
