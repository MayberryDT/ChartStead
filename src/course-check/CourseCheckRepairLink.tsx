import { useNavigate } from "@tanstack/react-router";
import type { MouseEvent, ReactNode } from "react";

/**
 * In-app repair target: keeps a real href for middle-click / copy, but left-click
 * uses TanStack client navigation (no full document reload).
 */
export function CourseCheckRepairLink({
  href,
  className,
  children,
  onNavigate,
  "data-issue-action-id": issueActionId,
}: {
  href: string;
  className?: string;
  children: ReactNode;
  onNavigate?: () => void;
  "data-issue-action-id"?: string;
}) {
  const navigate = useNavigate();

  return (
    <a
      className={className}
      href={href}
      data-issue-action-id={issueActionId}
      onClick={(click: MouseEvent<HTMLAnchorElement>) => {
        if (
          click.button !== 0 ||
          click.altKey ||
          click.ctrlKey ||
          click.metaKey ||
          click.shiftKey
        ) {
          return;
        }
        click.preventDefault();
        onNavigate?.();
        void navigateRepairTarget(navigate, href);
      }}
    >
      {children}
    </a>
  );
}

type NavigateFn = ReturnType<typeof useNavigate>;

export async function navigateRepairTarget(
  navigate: NavigateFn,
  href: string,
): Promise<void> {
  const url = new URL(href, window.location.origin);
  const parts = url.pathname.split("/").filter(Boolean);
  const search = Object.fromEntries(url.searchParams.entries());

  if (parts[0] === "e" && parts[2] === "agenda" && parts[1]) {
    await navigate({
      to: "/e/$eventId/agenda",
      params: { eventId: parts[1] },
      search: {
        day: search.day,
        session: search.session,
        sessionIds: search.sessionIds,
        returnTo: search.returnTo,
      },
    });
    return;
  }

  if (parts[0] === "e" && parts[2] === "submissions" && parts[1] && parts[3]) {
    await navigate({
      to: "/e/$eventId/submissions/$proposalId",
      params: { eventId: parts[1], proposalId: parts[3] },
      search: {
        field: search.field,
        returnTo: search.returnTo,
      },
    });
    return;
  }

  if (parts[0] === "e" && parts[2] === "submissions" && parts[1] && !parts[3]) {
    await navigate({
      to: "/e/$eventId/submissions",
      params: { eventId: parts[1] },
      search: {
        returnTo: search.returnTo,
      },
    });
    return;
  }

  if (parts[0] === "e" && parts[2] === "speakers" && parts[1]) {
    await navigate({
      to: "/e/$eventId/speakers",
      params: { eventId: parts[1] },
    });
    return;
  }

  if (parts[0] === "e" && parts[2] === "course-checks" && parts[1] && parts[3]) {
    await navigate({
      to: "/e/$eventId/course-checks/$planId",
      params: { eventId: parts[1], planId: parts[3] },
      search: {
        stage: search.stage,
      },
    });
    return;
  }

  // Unknown target — fall back to a normal navigation rather than a no-op.
  window.location.assign(url.pathname + url.search + url.hash);
}
