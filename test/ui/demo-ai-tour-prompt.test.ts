import { describe, expect, it } from "vitest";

import {
  DEFAULT_DEMO_ORIGIN,
  DEMO_AI_TOUR_TOAST,
  buildDemoAiTourPrompt,
} from "../../shared/demo-ai-tour-prompt";

describe("demo AI tour prompt", () => {
  it("embeds AEWF demo facts and asks how to run the tour in plain language", () => {
    const prompt = buildDemoAiTourPrompt("https://demo.chartstead.com");

    expect(prompt).toContain("https://demo.chartstead.com/demo");
    expect(prompt).toContain("ai-engineer-worlds-fair-2026");
    expect(prompt).toContain("SUB-AEWF0017");
    expect(prompt).toContain("Nora Ellison");
    expect(prompt).toContain("aewf-embed-sessions");
    expect(prompt).toContain(
      "I'm ready to walk you through the ChartStead demo",
    );
    expect(prompt).toContain("You do everything in the browser");
    expect(prompt).toContain("I'll also use ChartStead's API (or MCP)");
    expect(prompt).toContain("Settings → Agents");
    expect(prompt).toContain("Propose only");
    expect(prompt).toContain("Decisions");
    expect(prompt).not.toMatch(/grant read \/ Course Check scopes/i);
    expect(prompt).not.toMatch(/guide-only|guide \+ hands|Guide-only|Guide \+ hands/i);
    expect(prompt).toContain("**cannot** control their mouse");
    expect(prompt).toContain("do not apply");
  });

  it("uses the provided origin for local or Tailscale demos", () => {
    const prompt = buildDemoAiTourPrompt("http://100.105.117.93:5835");
    expect(prompt).toContain("http://100.105.117.93:5835/demo");
    expect(prompt).toContain("http://100.105.117.93:5835/mcp");
    expect(prompt).not.toContain(`${DEFAULT_DEMO_ORIGIN}/demo`);
  });

  it("exposes toast copy for the demo entry control", () => {
    expect(DEMO_AI_TOUR_TOAST).toMatch(/Paste it into your AI agent/i);
  });
});
