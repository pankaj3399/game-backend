import crypto from 'crypto';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as AppleStrategy } from 'passport-apple';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import User from '../models/User';
import UserAuth from '../models/UserAuth';
import { logger } from '../lib/logger';
import { createOAuthStateStore } from './oauthState';

// --- Email helpers ---

function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
}

async function findOrCreateUserByEmail(email: string, session: mongoose.ClientSession) {
	const normalizedEmail = normalizeEmail(email);
	const existing = await User.findOne({ email: normalizedEmail }).session(session);
	if (existing) return { user: existing, created: false };

	const [newUser] = await User.create([{ email: normalizedEmail }], { session });
	if (!newUser) throw new Error('User creation failed');
	return { user: newUser, created: true };
}

// --- Apple-specific helpers ---

const APPLE_PLACEHOLDER_EMAIL_PREFIX = 'apple-';
const APPLE_PLACEHOLDER_EMAIL_SUFFIX = '@users.noreply.local';

function getApplePlaceholderEmail(appleId: string): string {
	return `${APPLE_PLACEHOLDER_EMAIL_PREFIX}${appleId}${APPLE_PLACEHOLDER_EMAIL_SUFFIX}`;
}

export function isApplePlaceholderEmail(email: string): boolean {
	return email.startsWith(APPLE_PLACEHOLDER_EMAIL_PREFIX) && email.endsWith(APPLE_PLACEHOLDER_EMAIL_SUFFIX);
}

interface VerifiedAppleIdToken {
	sub?: string;
	email?: string;
}

const APPLE_JWKS_URL = 'https://appleid.apple.com/auth/keys';
const APPLE_ISSUER = 'https://appleid.apple.com';
const JWKS_CACHE_TTL_MS = 3600_000; // 1 hour

interface JwksCache {
	keys: Array<{ kid: string; jwk: crypto.JsonWebKey }>;
	fetchedAt: number;
}

let jwksCache: JwksCache | null = null;

async function fetchAppleJwks(): Promise<JwksCache> {
	if (jwksCache && Date.now() - jwksCache.fetchedAt < JWKS_CACHE_TTL_MS) {
		return jwksCache;
	}
	const res = await fetch(APPLE_JWKS_URL);
	if (!res.ok) throw new Error(`Failed to fetch Apple JWKS: ${res.status}`);
	const body = (await res.json()) as { keys?: Array<{ kid?: string } & crypto.JsonWebKey> };
	const keys = (body.keys ?? []).map((k) => ({ kid: k.kid ?? '', jwk: k }));
	jwksCache = { keys, fetchedAt: Date.now() };
	return jwksCache;
}

/**
 * Verifies Apple id_token by fetching JWKS, selecting key by kid, and validating
 * signature and claims (iss, aud, exp). Returns the verified payload or null on failure.
 */
async function verifyAppleIdToken(idToken: string, clientId: string): Promise<VerifiedAppleIdToken | null> {
	try {
		const decoded = jwt.decode(idToken, { complete: true });
		if (!decoded || typeof decoded === 'string' || !decoded.header?.kid) return null;

		const jwks = await fetchAppleJwks();
		const matchingKey = jwks.keys.find((k) => k.kid === decoded.header.kid);
		if (!matchingKey) return null;

		const publicKey = crypto.createPublicKey({ key: matchingKey.jwk, format: 'jwk' });
		const payload = jwt.verify(idToken, publicKey, {
			algorithms: ['RS256'],
			issuer: APPLE_ISSUER,
			audience: clientId,
		}) as VerifiedAppleIdToken & { iss?: string; aud?: string; exp?: number };
		return { sub: payload.sub, email: payload.email };
	} catch {
		return null;
	}
}

const APPLE_PRIVATE_KEY_BEGIN_MARKER = '-----BEGIN PRIVATE KEY-----';
const APPLE_PRIVATE_KEY_END_MARKER = '-----END PRIVATE KEY-----';

function normalizeApplePrivateKey(raw: string): string {
	const trimmed = raw.trim().replace(/^"|"$/g, '');
	const normalizedNewlines = trimmed.replace(/\\n/g, '\n').replace(/\r\n/g, '\n');
	const keyBody = normalizedNewlines
		.replace(APPLE_PRIVATE_KEY_BEGIN_MARKER, '')
		.replace(APPLE_PRIVATE_KEY_END_MARKER, '')
		.replace(/\s+/g, '');
	const wrappedBody = keyBody.match(/.{1,64}/g)?.join('\n') ?? keyBody;
	return `${APPLE_PRIVATE_KEY_BEGIN_MARKER}\n${wrappedBody}\n${APPLE_PRIVATE_KEY_END_MARKER}`;
}

function validateApplePrivateKey(privateKey: string, teamId: string, clientId: string, keyId: string): void {
	jwt.sign(
		{
			iss: teamId,
			iat: Math.floor(Date.now() / 1000),
			exp: Math.floor(Date.now() / 1000) + 300,
			aud: 'https://appleid.apple.com',
			sub: clientId,
		},
		privateKey,
		{ algorithm: 'ES256', keyid: keyId }
	);
}

// --- Generic OAuth flow ---

type OAuthProvider = 'google' | 'apple';

interface OAuthProviderConfig {
	provider: OAuthProvider;
	providerId: string;
	providerIdField: 'googleId' | 'appleId';
	email: string;
	providerName: string;
	conflictMessage: string;
	linkMessage: string;
	signInByProviderMessage: string;
	/** Extra fields to include in success log (e.g. usedPlaceholder for Apple) */
	extraLogFields?: Record<string, unknown>;
}

type OAuthDone = (err: Error | null, user?: Express.User) => void;

async function handleOAuthCallback(
	config: OAuthProviderConfig,
	done: OAuthDone
): Promise<void> {
	const session = await mongoose.startSession();
	session.startTransaction();

	try {
		const lookup = { [config.providerIdField]: config.providerId } as { googleId?: string; appleId?: string };
		const byProviderId = await UserAuth.findOne(lookup).populate('user').session(session);

		if (byProviderId?.user) {
			await session.abortTransaction();
			logger.info(config.signInByProviderMessage, { [config.providerIdField]: config.providerId });
			return done(null, byProviderId.user as unknown as Express.User);
		}

		const { user, created } = await findOrCreateUserByEmail(config.email, session);
		const existingAuth = await UserAuth.findOne({ user: user._id }).session(session);

		if (existingAuth) {
			const existingProviderId = existingAuth[config.providerIdField];
			if (existingProviderId && existingProviderId !== config.providerId) {
				await session.abortTransaction();
				return done(new Error(config.conflictMessage));
			}

			if (!existingProviderId) {
				if (config.providerIdField === 'googleId') {
					existingAuth.googleId = config.providerId;
				} else {
					existingAuth.appleId = config.providerId;
				}
				await existingAuth.save({ session });
				logger.info(config.linkMessage, { userId: user._id });
			}
		} else {
			await UserAuth.create([{ user: user._id, [config.providerIdField]: config.providerId }], { session });
		}

		await session.commitTransaction();
		logger.info(created ? `${config.providerName} sign-up: new user created` : `${config.providerName} sign-in by email`, {
			userId: user._id,
			...config.extraLogFields,
		});
		return done(null, user as unknown as Express.User);
	} catch (error) {
		await session.abortTransaction();
		logger.error(`${config.providerName} strategy error`, { error });
		return done(error as Error);
	} finally {
		await session.endSession().catch(() => {});
	}
}

// --- Google Strategy ---

interface GoogleProfile {
	id: string;
	emails?: Array<{ value?: string }>;
}

function registerGoogleStrategy(): void {
	if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_CALLBACK_URL) {
		logger.warn('Google OAuth strategy not registered - missing environment variables');
		return;
	}

	passport.use(
		new GoogleStrategy(
			{
				clientID: process.env.GOOGLE_CLIENT_ID,
				clientSecret: process.env.GOOGLE_CLIENT_SECRET,
				callbackURL: process.env.GOOGLE_CALLBACK_URL,
				scope: ['profile', 'email'],
				store: createOAuthStateStore('google'),
			},
			(_accessToken: string, _refreshToken: string, profile: GoogleProfile, done: OAuthDone) => {
				const email = profile.emails?.[0]?.value ? normalizeEmail(profile.emails[0].value) : undefined;

				if (!email) {
					return done(new Error('No email returned from Google - ensure email scope is granted'));
				}

				void handleOAuthCallback(
					{
						provider: 'google',
						providerId: profile.id,
						providerIdField: 'googleId',
						email,
						providerName: 'Google',
						conflictMessage: 'Google account conflict: this email is already linked to a different Google account',
						linkMessage: 'Linked googleId to existing user',
						signInByProviderMessage: 'Google sign-in by googleId',
					},
					done
				);
			}
		)
	);
}

registerGoogleStrategy();

// --- Apple Strategy ---

interface AppleProfile {
	id?: string;
	email?: string;
}

function registerAppleStrategy(): void {
	const clientId = process.env.APPLE_CLIENT_ID;
	const teamId = process.env.APPLE_TEAM_ID;
	const keyId = process.env.APPLE_KEY_ID;
	const privateKey = process.env.APPLE_PRIVATE_KEY;
	const callbackURL = process.env.APPLE_CALLBACK_URL;

	if (!clientId || !teamId || !keyId || !privateKey || !callbackURL) {
		logger.warn('Apple OAuth strategy not registered - missing environment variables');
		return;
	}

	const normalizedKey = normalizeApplePrivateKey(privateKey);

	try {
		validateApplePrivateKey(normalizedKey, teamId, clientId, keyId);
	} catch (error) {
		logger.error('Apple OAuth strategy not registered', {
			error: error instanceof Error ? error.message : String(error),
		});
		return;
	}

	passport.use(
		new AppleStrategy(
			{
				clientID: clientId,
				teamID: teamId,
				keyID: keyId,
				privateKeyString: normalizedKey,
				callbackURL,
				responseType: 'code id_token',
				scope: ['name', 'email'],
				store: createOAuthStateStore('apple'),
				passReqToCallback: false,
			},
			(async (
				_accessToken: string,
				_refreshToken: string,
				idToken: string,
				profile: AppleProfile | undefined,
				done: OAuthDone
			) => {
				if (!idToken) {
					return done(new Error('Apple token exchange did not return an id_token'));
				}

				const verified = await verifyAppleIdToken(idToken, clientId);
				if (!verified?.sub) {
					return done(new Error('Invalid or expired Apple id_token'));
				}

				const appleId = verified.sub;
				const email = verified.email ?? profile?.email ?? '';
				const effectiveEmail = email ? normalizeEmail(email) : getApplePlaceholderEmail(appleId);

				void handleOAuthCallback(
					{
						provider: 'apple',
						providerId: appleId,
						providerIdField: 'appleId',
						email: effectiveEmail,
						providerName: 'Apple',
						conflictMessage: 'Apple account conflict: this email is already linked to a different Apple account',
						linkMessage: 'Linked appleId to existing user',
						signInByProviderMessage: 'Apple sign-in by appleId',
						extraLogFields: { usedPlaceholder: !email },
					},
					done
				);
			}) as (...args: unknown[]) => void
		)
	);
}

registerAppleStrategy();
