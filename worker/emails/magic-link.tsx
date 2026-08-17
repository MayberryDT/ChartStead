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

export interface MagicLinkEmailInput {
  url: string;
}

export function MagicLinkEmail({ url }: MagicLinkEmailInput) {
  return (
    <Html lang="en">
      <Head />
      <Preview>Use this secure link to open your ChartStead event desk.</Preview>
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
            Sign in to ChartStead
          </Heading>
          <Text
            style={{
              margin: "12px 0 0",
              fontSize: "15px",
              lineHeight: 1.55,
              color: colors.muted,
            }}
          >
            Use this secure link to open your event desk. It is only for the
            inbox that requested it.
          </Text>
          <Button
            href={url}
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
            Open your event desk
          </Button>
          <Text
            style={{
              margin: "20px 0 0",
              fontSize: "13px",
              lineHeight: 1.55,
              color: colors.muted,
              wordBreak: "break-all",
            }}
          >
            If the button does not work, paste this URL into your browser:
            <br />
            {url}
          </Text>
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
            This link expires. If you did not ask to sign in, you can ignore
            this email.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export async function renderMagicLinkEmail(
  input: MagicLinkEmailInput,
): Promise<Pick<OutboundEmail, "subject" | "html" | "text">> {
  const html = await render(<MagicLinkEmail {...input} />);
  const text = toPlainText(html)
    .replace(/Open your event desk\s+(\S+)/g, "Open your event desk: $1")
    .trim();

  return {
    subject: "Sign in to ChartStead",
    html,
    text,
  };
}
