import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { fetchOrganizerForms } from "./api";

export function FormsWorkspace({ eventId }: { eventId: string }) {
  const forms = useQuery({
    queryKey: ["forms", eventId],
    queryFn: () => fetchOrganizerForms(eventId),
  });

  return (
    <div className="work forms-work" aria-label="Forms workspace">
      <div className="forms-work-header">
        <div>
          <p className="eyebrow">CFP forms</p>
          <h2>Guided call for proposals</h2>
        </div>
      </div>

      {forms.isPending ? <p className="empty-state">Loading forms…</p> : null}
      {forms.isError ? (
        <p className="form-message" data-tone="error" role="alert">
          {forms.error.message}
        </p>
      ) : null}

      {forms.isSuccess && (forms.data ?? []).length === 0 ? (
        <p className="empty-state">No forms yet. Create one to open a public CFP.</p>
      ) : null}

      <ul className="form-card-list">
        {(forms.data ?? []).map((form) => (
          <li key={form.id}>
            <Link
              className="form-card"
              to="/e/$eventId/forms/$formId"
              params={{ eventId, formId: form.id }}
            >
              <strong>{form.name}</strong>
              <span className={`status-pill status-${form.lifecycleStatus}`}>
                {form.lifecycleStatus}
              </span>
              <span>
                {form.publishedVersion
                  ? `Published v${form.publishedVersion}`
                  : "Not published yet"}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
