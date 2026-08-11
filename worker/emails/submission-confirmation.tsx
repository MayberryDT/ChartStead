import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Text,
  render,
  toPlainText,
} from "react-email";

import type { OutboundEmail } from "../email";

const colors = {
  background: "#f3f5f7",
  surface: "#ffffff",
  border: "#d7dee7",
  ink: "#081d3a",
  muted: "#526071",
  footer: "#5b6878",
} as const;

export interface SubmissionConfirmationEmailInput {
  eventName: string;
  proposalId: string;
  proposalTitle: string;
  speakerName: string;
  editUrl: string;
}

export function SubmissionConfirmationEmail(
  input: SubmissionConfirmationEmailInput,
) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{`Proposal received: ${input.proposalTitle}`}</Preview>
      <Body
        style={{
          margin: 0,
          padding: 0,
          backgroundColor: colors.background,
          fontFamily: "Inter, system-ui, sans-serif",
          color: colors.ink,
        }}
      >
        <Container
          style={{
            maxWidth: "560px",
            margin: "32px auto",
            backgroundColor: colors.surface,
            border: `1px solid ${colors.border}`,
            borderRadius: "8px",
            padding: "28px",
          }}
        >
          <Text
            style={{
              margin: 0,
              fontSize: "12px",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: colors.muted,
            }}
          >
            ChartStead
          </Text>
          <Heading
            as="h1"
            style={{
              margin: "12px 0 0",
              fontSize: "22px",
              fontWeight: 700,
              lineHeight: 1.3,
              color: colors.ink,
            }}
          >
            Proposal received
          </Heading>
          <Text
            style={{
              margin: "12px 0 0",
              fontSize: "15px",
              lineHeight: 1.55,
              color: colors.muted,
            }}
          >
            Hi {input.speakerName}, thanks for submitting to{" "}
            <span style={{ color: colors.ink, fontWeight: 600 }}>
              {input.eventName}
            </span>
            .
          </Text>
          <Text
            style={{
              margin: "16px 0 0",
              fontSize: "15px",
              lineHeight: 1.55,
              color: colors.ink,
            }}
          >
            <span style={{ fontWeight: 700 }}>{input.proposalTitle}</span>
            <br />
            Proposal ID: {input.proposalId}
          </Text>
          <Button
            href={input.editUrl}
            style={{
              display: "inline-block",
              marginTop: "24px",
              backgroundColor: colors.ink,
              color: "#ffffff",
              textDecoration: "none",
              padding: "12px 18px",
              borderRadius: "4px",
              fontWeight: 600,
              fontSize: "15px",
            }}
          >
            Edit your proposal
          </Button>
          <Hr
            style={{
              borderColor: colors.border,
              margin: "20px 0",
            }}
          />
          <Text
            style={{
              margin: 0,
              fontSize: "13px",
              color: colors.footer,
              lineHeight: 1.5,
            }}
          >
            This secure link expires. If it stops working, contact the event
            organizers.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export async function renderSubmissionConfirmationEmail(
  input: SubmissionConfirmationEmailInput,
): Promise<OutboundEmail> {
  const html = await render(<SubmissionConfirmationEmail {...input} />);
  const text = toPlainText(html)
    .replace(
      /Edit your proposal\s+(\S+)/g,
      "Edit your proposal: $1",
    )
    .trim();

  return {
    to: "",
    subject: `Proposal received: ${input.proposalTitle}`,
    html,
    text,
  };
}
