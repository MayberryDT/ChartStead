import { Button } from "@base-ui/react/button";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import markOnLightUrl from "../design/assets/brand/chartstead-mark-on-light.png";
import {
  DEMO_AI_TOUR_TOAST,
  buildDemoAiTourPrompt,
} from "../shared/demo-ai-tour-prompt";

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

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.left = "-9999px";
  document.body.appendChild(area);
  area.select();
  const ok = document.execCommand("copy");
  document.body.removeChild(area);
  if (!ok) {
    throw new Error("Could not copy the tour prompt.");
  }
}

export function DemoPersonasPage({
  navigateTo = (path) => window.location.assign(path),
}: {
  navigateTo?: (path: string) => void;
}) {
  const [entering, setEntering] = useState<DemoPersona["id"] | null>(null);
  const [tourToast, setTourToast] = useState<string | null>(null);
  const [tourCopyError, setTourCopyError] = useState<string | null>(null);
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

  useEffect(() => {
    if (!tourToast) return;
    const timer = window.setTimeout(() => setTourToast(null), 5000);
    return () => window.clearTimeout(timer);
  }, [tourToast]);

  async function copyAiTourPrompt() {
    setTourCopyError(null);
    try {
      const origin =
        typeof window !== "undefined" ? window.location.origin : undefined;
      await copyText(buildDemoAiTourPrompt(origin));
      setTourToast(DEMO_AI_TOUR_TOAST);
    } catch (error) {
      setTourCopyError(
        error instanceof Error ? error.message : "Could not copy the tour prompt.",
      );
    }
  }

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
        <p className="demo-persona-ai-tour">
          Prefer an agent?{" "}
          <button
            type="button"
            className="demo-persona-ai-tour-link"
            onClick={() => void copyAiTourPrompt()}
          >
            Copy AI-guided tour
          </button>
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
        {enter.isError || reset.isError || tourCopyError ? (
          <p className="form-message" data-tone="error" role="alert">
            {tourCopyError ?? (enter.error ?? reset.error)?.message}
          </p>
        ) : null}
      </section>
      {tourToast ? (
        <p className="demo-persona-toast" role="status" data-tone="success">
          {tourToast}
        </p>
      ) : null}
    </main>
  );
}
