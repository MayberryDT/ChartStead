import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Model, type CompletingEvent } from "survey-core";
import "survey-core/survey-core.css";
import { Survey } from "survey-react-ui";

import markOnLightUrl from "../design/assets/brand/chartstead-mark-on-light.png";
import type {
  ProposalInput,
  ProposalValidationError,
  PublishedCfpForm,
} from "../shared/events";
import { ApiError, fetchCfp, submitProposal } from "./api";

export function CfpPage() {
  const { eventId } = useParams({ from: "/e/$eventId/cfp" });
  const cfp = useQuery({
    queryKey: ["cfp", eventId],
    queryFn: () => fetchCfp(eventId),
  });

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
          <button
            className="primary-action"
            type="button"
            onClick={() => void cfp.refetch()}
          >
            Try again
          </button>
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

        <PublishedCfpRuntime
          key={`${eventId}:${cfp.data.form.id}:${cfp.data.form.definitionVersion}`}
          eventId={eventId}
          form={cfp.data.form}
        />

        <p className="cfp-foot">
          Organizers open submissions from the event desk.{" "}
          <Link to="/">Return to ChartStead</Link>
        </p>
      </section>
    </main>
  );
}

function PublishedCfpRuntime({
  eventId,
  form,
}: {
  eventId: string;
  form: PublishedCfpForm;
}) {
  const navigate = useNavigate();
  const [survey] = useState(() => new Model(form.definition));

  useEffect(() => {
    let createdProposalId: string | null = null;

    const handleCompleting = async (
      sender: Model,
      options: CompletingEvent,
    ) => {
      try {
        const proposal = await submitProposal(
          eventId,
          sender.data as ProposalInput,
          form,
        );
        createdProposalId = proposal.id;
      } catch (error) {
        options.allow = false;
        if (error instanceof ApiError && error.status === 400) {
          const validation = error.body as ProposalValidationError;
          sender.data = validation.values;
          for (const question of sender.getAllQuestions()) {
            question.clearErrors();
          }
          let firstInvalidQuestion: string | null = null;
          for (const [name, message] of Object.entries(validation.errors)) {
            if (!message) continue;
            const question = sender.getQuestionByName(name);
            if (!question) continue;
            question.addError(message);
            firstInvalidQuestion ??= name;
          }
          if (firstInvalidQuestion) {
            sender.focusQuestion(firstInvalidQuestion);
          }
          return;
        }
        options.message =
          error instanceof Error
            ? error.message
            : "Unable to submit this proposal. Try again.";
      }
    };

    const handleComplete = () => {
      if (!createdProposalId) return;
      void navigate({
        to: "/e/$eventId/proposals/$proposalId",
        params: { eventId, proposalId: createdProposalId },
      });
    };

    survey.onCompleting.add(handleCompleting);
    survey.onComplete.add(handleComplete);
    return () => {
      survey.onCompleting.remove(handleCompleting);
      survey.onComplete.remove(handleComplete);
    };
  }, [eventId, form, navigate, survey]);

  return (
    <div
      className="cfp-survey"
      data-form-id={form.id}
      data-definition-version={form.definitionVersion}
    >
      <Survey model={survey} />
    </div>
  );
}
