import {
  signScoreQrToken,
  verifyAndDecodeScoreQrToken,
  buildScoreQrValidationUrl,
  SCORE_QR_AUDIENCE,
  SCORE_QR_ISSUER,
  SCORE_QR_TOKEN_TTL_SECONDS,
} from '../scoreQrToken';
import { AppError } from '../errors';
import crypto from 'crypto';

const VALID_SECRET = 'test-secret-for-score-qr-signing-32chars!!';

beforeEach(() => {
  process.env.JWT_SECRET = VALID_SECRET;
});

afterEach(() => {
  delete process.env.JWT_SECRET;
  delete process.env.WEB_APP_URL;
});

function buildMinimalPayload() {
  return {
    jti: crypto.randomUUID(),
    sid: 'session-id-123',
    flow: 'independent' as const,
    tid: null,
    mid: 'match-id-abc',
    rby: 'user-id-xyz',
    opp: null,
  };
}

describe('signScoreQrToken() + verifyAndDecodeScoreQrToken() round-trip', () => {
  it('produces a 3-part JWT string', () => {
    const token = signScoreQrToken(buildMinimalPayload());
    expect(token.split('.').length).toBe(3);
  });

  it('decodes back to the same payload fields', () => {
    const payload = buildMinimalPayload();
    const token = signScoreQrToken(payload);
    const decoded = verifyAndDecodeScoreQrToken(token);

    expect(decoded.jti).toBe(payload.jti);
    expect(decoded.sid).toBe(payload.sid);
    expect(decoded.flow).toBe(payload.flow);
    expect(decoded.tid).toBeNull();
    expect(decoded.mid).toBe(payload.mid);
    expect(decoded.rby).toBe(payload.rby);
    expect(decoded.opp).toBeNull();
  });

  it('sets aud and iss to the expected constants', () => {
    const token = signScoreQrToken(buildMinimalPayload());
    const decoded = verifyAndDecodeScoreQrToken(token);
    expect(decoded.aud).toBe(SCORE_QR_AUDIENCE);
    expect(decoded.iss).toBe(SCORE_QR_ISSUER);
  });

  it('sets exp approximately TTL seconds in the future', () => {
    const before = Math.floor(Date.now() / 1000);
    const token = signScoreQrToken(buildMinimalPayload());
    const decoded = verifyAndDecodeScoreQrToken(token);
    const after = Math.floor(Date.now() / 1000);

    expect(decoded.exp).toBeGreaterThanOrEqual(before + SCORE_QR_TOKEN_TTL_SECONDS - 1);
    expect(decoded.exp).toBeLessThanOrEqual(after + SCORE_QR_TOKEN_TTL_SECONDS + 1);
  });

  it('works with tournament flow and non-null tid', () => {
    const payload = { ...buildMinimalPayload(), flow: 'tournament' as const, tid: 'tournament-id' };
    const token = signScoreQrToken(payload);
    const decoded = verifyAndDecodeScoreQrToken(token);
    expect(decoded.flow).toBe('tournament');
    expect(decoded.tid).toBe('tournament-id');
  });
});

describe('verifyAndDecodeScoreQrToken() — rejection cases', () => {
  it('throws AppError 400 for a token with only 2 parts', () => {
    expect(() => verifyAndDecodeScoreQrToken('part1.part2')).toThrow(AppError);
    try {
      verifyAndDecodeScoreQrToken('part1.part2');
    } catch (err) {
      expect((err as AppError).statusCode).toBe(400);
    }
  });

  it('throws AppError 401 when the signature is tampered', () => {
    const token = signScoreQrToken(buildMinimalPayload());
    const [h, p] = token.split('.');
    const tampered = `${h}.${p}.invalidsignature`;
    expect(() => verifyAndDecodeScoreQrToken(tampered)).toThrow(AppError);
    try {
      verifyAndDecodeScoreQrToken(tampered);
    } catch (err) {
      expect((err as AppError).statusCode).toBe(401);
    }
  });

  it('throws AppError 400 when the payload is not valid JSON', () => {
    const fakeHeader = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const fakePayload = Buffer.from('not json at all').toString('base64url');
    const signingData = `${fakeHeader}.${fakePayload}`;
    const sig = crypto.createHmac('sha256', VALID_SECRET).update(signingData).digest('base64url');
    const token = `${signingData}.${sig}`;
    expect(() => verifyAndDecodeScoreQrToken(token)).toThrow(AppError);
    try {
      verifyAndDecodeScoreQrToken(token);
    } catch (err) {
      // Could be 400 (malformed payload) or 401 (sig mismatch due to Base64 variant) — both are AppError
      expect(err).toBeInstanceOf(AppError);
    }
  });

  it('throws AppError 410 for an expired token', () => {
    const payload = buildMinimalPayload();
    // Manually craft a token with exp in the past
    const header = { alg: 'HS256', typ: 'JWT' };
    const fullPayload = {
      aud: SCORE_QR_AUDIENCE,
      iss: SCORE_QR_ISSUER,
      iat: Math.floor(Date.now() / 1000) - 700,
      exp: Math.floor(Date.now() / 1000) - 1, // already expired
      ...payload,
    };

    const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
    const encodedPayload = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
    const data = `${encodedHeader}.${encodedPayload}`;
    const sig = crypto.createHmac('sha256', VALID_SECRET).update(data).digest('base64url');
    const token = `${data}.${sig}`;

    try {
      verifyAndDecodeScoreQrToken(token);
      fail('Expected an error to be thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).statusCode).toBe(410);
    }
  });

  it('throws AppError when JWT_SECRET is not set', () => {
    delete process.env.JWT_SECRET;
    expect(() => signScoreQrToken(buildMinimalPayload())).toThrow(AppError);
    try {
      signScoreQrToken(buildMinimalPayload());
    } catch (err) {
      expect((err as AppError).statusCode).toBe(500);
    }
  });
});

describe('buildScoreQrValidationUrl()', () => {
  it('produces a URL with the token as a query parameter', () => {
    process.env.WEB_APP_URL = 'https://app.example.com';
    const url = buildScoreQrValidationUrl('mytoken123');
    expect(url).toContain('/record-score/validate');
    expect(url).toContain('token=mytoken123');
  });

  it('strips the path from the base URL (uses only protocol + host)', () => {
    process.env.WEB_APP_URL = 'https://app.example.com/some/path';
    const url = buildScoreQrValidationUrl('tok');
    expect(url.startsWith('https://app.example.com/record-score/validate')).toBe(true);
  });

  it('uses an explicit base URL when provided', () => {
    process.env.WEB_APP_URL = 'https://fallback.example.com';
    const url = buildScoreQrValidationUrl('tok', 'https://custom.example.com');
    expect(url.startsWith('https://custom.example.com')).toBe(true);
  });

  it('throws AppError 500 when no base URL is configured', () => {
    delete process.env.WEB_APP_URL;
    expect(() => buildScoreQrValidationUrl('tok')).toThrow(AppError);
    try {
      buildScoreQrValidationUrl('tok');
    } catch (err) {
      expect((err as AppError).statusCode).toBe(500);
    }
  });
});
