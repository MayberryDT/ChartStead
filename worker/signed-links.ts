const encoder = new TextEncoder();

function toBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  const binary = atob(padded + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export interface SignedEditTokenPayload {
  v: 1;
  eventId: string;
  proposalId: string;
  tokenId: string;
  exp: number;
}

export interface SignedPortalTokenPayload {
  v: 1;
  kind: "portal";
  eventId: string;
  speakerId: string;
  tokenId: string;
  exp: number;
}

async function signPayload(secret: string, payload: object): Promise<string> {
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const key = await importKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  return `${body}.${toBase64Url(signature)}`;
}

async function verifySignedBody(
  secret: string,
  token: string,
): Promise<unknown | null> {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, signature] = parts;
  if (!body || !signature) return null;

  try {
    const key = await importKey(secret);
    const signatureBytes = fromBase64Url(signature);
    const signatureBuffer = signatureBytes.buffer.slice(
      signatureBytes.byteOffset,
      signatureBytes.byteOffset + signatureBytes.byteLength,
    ) as ArrayBuffer;
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      signatureBuffer,
      encoder.encode(body),
    );
    if (!valid) return null;
    return JSON.parse(new TextDecoder().decode(fromBase64Url(body)));
  } catch {
    return null;
  }
}

export async function signEditToken(
  secret: string,
  payload: SignedEditTokenPayload,
): Promise<string> {
  return signPayload(secret, payload);
}

export async function verifyEditToken(
  secret: string,
  token: string,
  nowMs = Date.now(),
): Promise<SignedEditTokenPayload | null> {
  const parsed = await verifySignedBody(secret, token);
  if (!parsed || typeof parsed !== "object") return null;
  const payload = parsed as SignedEditTokenPayload;
  if (payload.v !== 1) return null;
  if (
    typeof payload.eventId !== "string" ||
    typeof payload.proposalId !== "string" ||
    typeof payload.tokenId !== "string" ||
    typeof payload.exp !== "number"
  ) {
    return null;
  }
  if (payload.exp * 1000 <= nowMs) return null;
  return payload;
}

export async function signPortalToken(
  secret: string,
  payload: SignedPortalTokenPayload,
): Promise<string> {
  return signPayload(secret, payload);
}

export async function verifyPortalToken(
  secret: string,
  token: string,
  nowMs = Date.now(),
): Promise<SignedPortalTokenPayload | null> {
  const parsed = await verifySignedBody(secret, token);
  if (!parsed || typeof parsed !== "object") return null;
  const payload = parsed as SignedPortalTokenPayload;
  if (payload.v !== 1 || payload.kind !== "portal") return null;
  if (
    typeof payload.eventId !== "string" ||
    typeof payload.speakerId !== "string" ||
    typeof payload.tokenId !== "string" ||
    typeof payload.exp !== "number"
  ) {
    return null;
  }
  if (payload.exp * 1000 <= nowMs) return null;
  return payload;
}

export function createTokenId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}
