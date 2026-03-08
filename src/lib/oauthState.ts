import crypto from 'crypto';
import type { Request } from 'express';
import jwt from 'jsonwebtoken';

type OAuthProvider = 'google' | 'apple';

interface OAuthStatePayload {
	provider: OAuthProvider;
	nonce: string;
}

const OAUTH_STATE_AUDIENCE = 'oauth-state';
const OAUTH_STATE_ISSUER = 'auth-service-oauth';
const OAUTH_STATE_TTL_MS = 15 * 60 * 1000;

function getOAuthStateSecret(): string {
	const secret = process.env.SESSION_SECRET ?? process.env.JWT_SECRET;
	if (!secret) {
		throw new Error('SESSION_SECRET or JWT_SECRET must be set for OAuth state verification');
	}

	return secret;
}

function getCookieName(provider: OAuthProvider): string {
	return `__oauth_state_${provider}`;
}

function hashStateToken(token: string): string {
	return crypto.createHash('sha256').update(token).digest('hex');
}

function getOAuthStateCookieOptions(req: Request) {
	const forwardedProto = req.headers['x-forwarded-proto'];
	const normalizedProto = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto;
	const host = req.headers.host ?? '';
	const isLocalHost =
		host.startsWith('localhost:') ||
		host === 'localhost' ||
		host.startsWith('127.0.0.1:') ||
		host === '127.0.0.1';
	const secure = req.secure || normalizedProto === 'https' || isLocalHost;

	return {
		httpOnly: true,
		secure,
		sameSite: 'none' as const,
		maxAge: OAUTH_STATE_TTL_MS,
		path: '/',
	};
}

function createStateToken(provider: OAuthProvider): string {
	return jwt.sign(
		{
			provider,
			nonce: crypto.randomBytes(32).toString('hex'),
		},
		getOAuthStateSecret(),
		{
			expiresIn: Math.floor(OAUTH_STATE_TTL_MS / 1000),
			audience: OAUTH_STATE_AUDIENCE,
			issuer: OAUTH_STATE_ISSUER,
		}
	);
}

function verifyStateToken(token: string, provider: OAuthProvider): OAuthStatePayload {
	const payload = jwt.verify(token, getOAuthStateSecret(), {
		audience: OAUTH_STATE_AUDIENCE,
		issuer: OAUTH_STATE_ISSUER,
	});

	if (!payload || typeof payload === 'string') {
		throw new Error('Invalid OAuth state payload');
	}

	const decodedProvider = (payload as Record<string, unknown>).provider;
	const nonce = (payload as Record<string, unknown>).nonce;

	if (decodedProvider !== provider || typeof nonce !== 'string' || nonce.length === 0) {
		throw new Error('OAuth state does not match the expected provider');
	}

	return { provider, nonce };
}

export function createOAuthStateStore(provider: OAuthProvider) {
	const cookieName = getCookieName(provider);

	return {
		store(req: Request, _meta: unknown, callback: (err: Error | null, state?: string) => void) {
			try {
				const stateToken = createStateToken(provider);
				req.res?.cookie(cookieName, hashStateToken(stateToken), getOAuthStateCookieOptions(req));
				callback(null, stateToken);
			} catch (error) {
				callback(error as Error);
			}
		},
		verify(
			req: Request,
			providedState: string,
			callback: (err: Error | null, ok?: boolean, state?: { message: string }) => void
		) {
			try {
				const expectedHash = req.cookies?.[cookieName];
				req.res?.clearCookie(cookieName, getOAuthStateCookieOptions(req));

				if (!expectedHash || typeof expectedHash !== 'string') {
					return callback(null, false, { message: 'OAuth state cookie is missing or expired' });
				}

				verifyStateToken(providedState, provider);

				if (hashStateToken(providedState) !== expectedHash) {
					return callback(null, false, { message: 'OAuth state mismatch' });
				}

				return callback(null, true, { message: 'OAuth state verified' });
			} catch {
				return callback(null, false, { message: 'Invalid or expired OAuth state' });
			}
		},
	};
}
