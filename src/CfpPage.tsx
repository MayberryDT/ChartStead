import { Button } from "@base-ui/react/button";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { FormEvent, useState } from "react";

import markOnLightUrl from "../design/assets/brand/chartstead-mark-on-light.png";
import type { ProposalInput, ProposalValidationError } from "../shared/events";
import { ApiError, fetchCfp, submitProposal } from "./api";

const emptyValues: ProposalInput = {
  title: "",
  abstract: "",
  trackId: "",
  speakerName: "",
  speakerEmail: "",
  biography: "",
  supportingLink: "",
};

export function CfpPage() {
  const { eventId } = useParams({ from: "/e/$eventId/cfp" });
  const navigate = useNavigate();
  const cfp = useQuery({
    queryKey: ["cfp", eventId],
    queryFn: () => fetchCfp(eventId),
  });
  const [values, setValues] = useState<ProposalInput>(emptyValues);
  const [errors, setErrors] = useState<Partial<Record<keyof ProposalInput, string>>>(
    {},
  );

  const mutation = useMutation({
    mutationFn: () => submitProposal(eventId, values),
    onSuccess: (proposal) => {
      void navigate({
        to: "/e/$eventId/proposals/$proposalId",
        params: { eventId, proposalId: proposal.id },
      });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 400) {
        const body = error.body as ProposalValidationError;
        setValues(body.values);
        setErrors(body.errors);
        return;
      }
      setErrors({
        title:
          error instanceof Error
            ? error.message
            : "Unable to submit this proposal.",
      });
    },
  });

  function update<K extends keyof ProposalInput>(key: K, value: ProposalInput[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});
    mutation.mutate();
  }

  if (cfp.isPending) {
    return (
      <main className="cfp-shell" aria-busy="true">
        <p>Loading call for proposals…</p>
      </main>
    );
  }

  if (cfp.isError) {
    return (
      <main className="cfp-shell">
        <section className="error-panel" role="alert">
          <h1>Call for proposals unavailable</h1>
          <p>{cfp.error.message}</p>
        </section>
      </main>
    );
  }

  return (
    <main className="cfp-shell">
      <section className="cfp-panel" aria-labelledby="cfp-title">
        <img src={markOnLightUrl} width="40" height="40" alt="" />
        <p className="eyebrow">Call for proposals</p>
        <h1 id="cfp-title">{cfp.data.event.name}</h1>
        <p>
          Submit a talk without creating an account. You will receive a stable
          proposal ID and confirmation page after submit.
        </p>

        <form className="cfp-form" onSubmit={onSubmit} noValidate>
          <Field
            id="title"
            label="Talk title"
            error={errors.title}
            value={values.title}
            onChange={(value) => update("title", value)}
            required
          />
          <Field
            id="abstract"
            label="Abstract"
            error={errors.abstract}
            value={values.abstract}
            onChange={(value) => update("abstract", value)}
            multiline
            required
          />
          <div className="cfp-field">
            <label htmlFor="trackId">Track</label>
            <select
              id="trackId"
              name="trackId"
              value={values.trackId}
              aria-invalid={Boolean(errors.trackId)}
              onChange={(change) => update("trackId", change.target.value)}
              required
            >
              <option value="">Select a track</option>
              {cfp.data.form.tracks.map((track) => (
                <option key={track.id} value={track.id}>
                  {track.name}
                </option>
              ))}
            </select>
            {errors.trackId ? (
              <p className="field-error" role="alert">
                {errors.trackId}
              </p>
            ) : null}
          </div>
          <Field
            id="speakerName"
            label="Speaker name"
            error={errors.speakerName}
            value={values.speakerName}
            onChange={(value) => update("speakerName", value)}
            required
          />
          <Field
            id="speakerEmail"
            label="Speaker email"
            type="email"
            error={errors.speakerEmail}
            value={values.speakerEmail}
            onChange={(value) => update("speakerEmail", value)}
            required
          />
          <Field
            id="biography"
            label="Biography"
            error={errors.biography}
            value={values.biography}
            onChange={(value) => update("biography", value)}
            multiline
            required
          />
          <Field
            id="supportingLink"
            label="Supporting link"
            type="url"
            error={errors.supportingLink}
            value={values.supportingLink}
            onChange={(value) => update("supportingLink", value)}
            placeholder="https://"
          />
          <Button
            className="primary-action"
            type="submit"
            disabled={mutation.isPending}
            focusableWhenDisabled
          >
            {mutation.isPending ? "Submitting…" : "Submit proposal"}
          </Button>
        </form>
        <p className="cfp-foot">
          Organizers open submissions from the event desk.{" "}
          <Link to="/">Return to ChartStead</Link>
        </p>
      </section>
    </main>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  error,
  multiline = false,
  type = "text",
  required = false,
  placeholder,
}: {
  id: keyof ProposalInput;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  multiline?: boolean;
  type?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <div className="cfp-field">
      <label htmlFor={id}>{label}</label>
      {multiline ? (
        <textarea
          id={id}
          name={id}
          value={value}
          required={required}
          aria-invalid={Boolean(error)}
          onChange={(change) => onChange(change.target.value)}
          rows={5}
        />
      ) : (
        <input
          id={id}
          name={id}
          type={type}
          value={value}
          required={required}
          placeholder={placeholder}
          aria-invalid={Boolean(error)}
          onChange={(change) => onChange(change.target.value)}
        />
      )}
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
