import crypto from "crypto";
import { AppError } from "./errors";

export const SCORE_QR_AUDIENCE = "score-validation";
export const SCORE_QR_ISSUER = "tb10";
export const SCORE_QR_TOKEN_TTL_SECONDS = 10 * 60; // 10 minutes

export type ScoreQrFlowKind = "tournament" | "independent";

export type ScoreQrTokenPayload = {
  aud: typeof SCORE_QR_AUDIENCE;
  iss: typeof SCORE_QR_ISSUER;
  iat: number;
  exp: number;
  jti: string;
  sid: string;
  flow: ScoreQrFlowKind;
  tid: string | null;
  mid: string;
  rby: string;
  opp: string | null;
};

function encodeBase64Url(input: Buffer | string): string {
  const b64 = Buffer.isBuffer(input)
    ? input.toString("base64")
    : Buffer.from(input).toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(input: string): Buffer {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padding =
    normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + padding, "base64");
}

function getScoreQrSecret(): string {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret) {
    throw new AppError("JWT_SECRET must be configured", 500);
  }
  return secret;
}

export function buildScoreQrValidationUrl(
  token: string,
  explicitBaseUrl?: string | null,
): string {
  const candidate =
    explicitBaseUrl?.trim() ||
    process.env.WEB_APP_URL?.trim() ||
    process.env.REQUEST_ORIGIN?.trim() ||
    process.env.CORS_ORIGIN?.split(",")[0]?.trim();

  if (!candidate) {
    throw new AppError(
      "Public base URL is required (WEB_APP_URL / REQUEST_ORIGIN / CORS_ORIGIN)",
      500,
    );
  }

  let base: string;
  try {
    const parsed = new URL(candidate);
    base = `${parsed.protocol}//${parsed.host}`;
  } catch {
    throw new AppError("Invalid public base URL", 500);
  }

  const url = new URL(`${base}/record-score/validate`);
  url.searchParams.set("token", token);
  return url.toString();
}

export function signScoreQrToken(
  payload: Omit<ScoreQrTokenPayload, "aud" | "iss" | "iat" | "exp">,
): string {
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + SCORE_QR_TOKEN_TTL_SECONDS;

  const fullPayload: ScoreQrTokenPayload = {
    aud: SCORE_QR_AUDIENCE,
    iss: SCORE_QR_ISSUER,
    iat,
    exp,
    ...payload,
  };

  const header = {
    alg: "HS256",
    typ: "JWT",
  };

  const encodedHeader = encodeBase64Url(JSON.stringify(header));
  const encodedPayload = encodeBase64Url(JSON.stringify(fullPayload));
  const data = `${encodedHeader}.${encodedPayload}`;

  const signature = crypto
    .createHmac("sha256", getScoreQrSecret())
    .update(data)
    .digest();

  return `${data}.${encodeBase64Url(signature)}`;
}

export function verifyAndDecodeScoreQrToken(token: string): ScoreQrTokenPayload {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new AppError("Malformed token", 400);
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const data = `${encodedHeader}.${encodedPayload}`;

  const expected = crypto
    .createHmac("sha256", getScoreQrSecret())
    .update(data)
    .digest();

  const got = decodeBase64Url(encodedSignature);

  if (
    expected.length !== got.length ||
    !crypto.timingSafeEqual(expected, got)
  ) {
    throw new AppError("Invalid token signature", 401);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(decodeBase64Url(encodedPayload).toString("utf8"));
  } catch {
    throw new AppError("Malformed token payload", 400);
  }

  if (!payload || typeof payload !== "object") {
    throw new AppError("Malformed token payload", 400);
  }

  const p = payload as Partial<ScoreQrTokenPayload>;

  if (
    p.aud !== SCORE_QR_AUDIENCE ||
    p.iss !== SCORE_QR_ISSUER ||
    typeof p.iat !== "number" ||
    typeof p.exp !== "number" ||
    typeof p.jti !== "string" ||
    typeof p.sid !== "string" ||
    (p.flow !== "tournament" && p.flow !== "independent") ||
    !(typeof p.tid === "string" || p.tid === null) ||
    typeof p.mid !== "string" ||
    typeof p.rby !== "string" ||
    !(typeof p.opp === "string" || p.opp === null)
  ) {
    throw new AppError("Malformed token payload", 400);
  }

  const now = Math.floor(Date.now() / 1000);
  if (p.exp <= now) {
    throw new AppError("Token expired", 410);
  }

  return p as ScoreQrTokenPayload;
}
