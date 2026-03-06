import passport from 'passport';
import type { Request } from 'express';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as AppleStrategy } from 'passport-apple';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import mongoose from 'mongoose';
import User, { type UserDocument } from '../models/User';
import UserAuth from '../models/UserAuth';
import { logger } from '../lib/logger';
import {
	getAppleFlowTrace,
	getAppleCookieTransportOptions,
	recordAppleFlowEvent,
	sanitizeFlowDetails,
	setAppleFlowTrace,
} from '../controllers/auth/appleFlow';

// ---------------------------------------------------------------------------
// Shared upsert helper — atomically finds or creates a User by email.
// Returns { user, created } where created=true means this is a new signup.
// ---------------------------------------------------------------------------
async function findOrCreateUserByEmail(
	email: string,
	session: mongoose.ClientSession
){
	const existing = await User.findOne({ email }).session(session);
	if (existing) return { user: existing, created: false };

	const [newUser] = await User.create([{ email }], { session });
	if (!newUser) throw new Error('User creation failed');
	return { user: newUser, created: true };
}

// ---------------------------------------------------------------------------
// Google OAuth Strategy
// ---------------------------------------------------------------------------
if (
	process.env.GOOGLE_CLIENT_ID &&
	process.env.GOOGLE_CLIENT_SECRET &&
	process.env.GOOGLE_CALLBACK_URL
) {
	passport.use(
		new GoogleStrategy(
			{
				clientID: process.env.GOOGLE_CLIENT_ID,
				clientSecret: process.env.GOOGLE_CLIENT_SECRET,
				callbackURL: process.env.GOOGLE_CALLBACK_URL,
				scope: ['profile', 'email'],
			},
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			async (_accessToken: string, _refreshToken: string, profile: any, done: (err: Error | null, user?: any) => void) => {
				const session = await mongoose.startSession();
				session.startTransaction();

				try {
					const googleId = profile.id;
					const email = profile.emails?.[0]?.value;

					if (!email) {
						await session.abortTransaction();
						return done(new Error('No email returned from Google — ensure email scope is granted'));
					}

					const byGoogleId = await UserAuth.findOne({ googleId }).populate('user').session(session);
					if (byGoogleId?.user) {
						await session.abortTransaction();
						logger.info('Google sign-in by googleId', { googleId });
						return done(null, byGoogleId.user as unknown as Express.User);
					}

					const { user, created } = await findOrCreateUserByEmail(email, session);

					const existingAuth = await UserAuth.findOne({ user: user._id }).session(session);
					if (existingAuth) {
						if (existingAuth.googleId && existingAuth.googleId !== googleId) {
							await session.abortTransaction();
							return done(new Error('Google account conflict: this email is already linked to a different Google account'));
						}
						if (!existingAuth.googleId) {
							existingAuth.googleId = googleId;
							await existingAuth.save({ session });
							logger.info('Linked googleId to existing user', { userId: user._id });
						}
					} else {
						await UserAuth.create([{ user: user._id, googleId }], { session });
					}

					await session.commitTransaction();
					logger.info(created ? 'Google sign-up: new user created' : 'Google sign-in by email', {
						userId: user._id,
					});
					return done(null, user as Express.User);
				} catch (error) {
					await session.abortTransaction();
					logger.error('Google strategy error', { error });
					return done(error as Error);
				} finally {
					await session.endSession();
				}
			}
		)
	);
} else {
	logger.warn('Google OAuth strategy not registered — missing environment variables');
}

// ---------------------------------------------------------------------------
// Apple OAuth Strategy
// ---------------------------------------------------------------------------

/** Placeholder email when Apple doesn't send email (returning users, Hide My Email). */
const APPLE_PLACEHOLDER_EMAIL_PREFIX = 'apple-';
const APPLE_PLACEHOLDER_EMAIL_SUFFIX = '@users.noreply.local';

function getApplePlaceholderEmail(appleId: string): string {
	return `${APPLE_PLACEHOLDER_EMAIL_PREFIX}${appleId}${APPLE_PLACEHOLDER_EMAIL_SUFFIX}`;
}

export function isApplePlaceholderEmail(email: string): boolean {
	return email.startsWith(APPLE_PLACEHOLDER_EMAIL_PREFIX) && email.endsWith(APPLE_PLACEHOLDER_EMAIL_SUFFIX);
}

function normalizeApplePrivateKey(raw: string): string {
	const trimmed = raw.trim();
	if (trimmed.includes('-----BEGIN')) return trimmed;
	return `-----BEGIN PRIVATE KEY-----\n${trimmed}\n-----END PRIVATE KEY-----`;
}

// ---------------------------------------------------------------------------
// Cookie-based OAuth state store
//
// passport-oauth2 normally stores the state parameter in the Express session.
// Apple's form_post is a cross-site POST from appleid.apple.com, so the
// session cookie (SameSite=Lax) is NOT sent by the browser. This store uses
// a dedicated SameSite=None cookie instead, which survives the cross-site POST.
// ---------------------------------------------------------------------------

export const APPLE_STATE_COOKIE = '__apple_oauth_state';

interface AppleStatePayload {
	nonce: string;
	trace: {
		traceId: string;
		provider: 'apple';
		startedAt: string;
		updatedAt: string;
		status: 'processing' | 'success' | 'signup_required' | 'error';
		outcomeCode?: string;
		summary?: string;
		events: {
			at: string;
			level: 'info' | 'warn' | 'error';
			code: string;
			message: string;
			details?: Record<string, unknown>;
		}[];
	};
}

function encodeAppleStatePayload(payload: AppleStatePayload): string {
	return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

function decodeAppleStatePayload(rawState: string | undefined): AppleStatePayload | null {
	if (!rawState) return null;

	try {
		const parsed = JSON.parse(Buffer.from(rawState, 'base64url').toString('utf8')) as AppleStatePayload;
		if (
			typeof parsed?.nonce === 'string' &&
			parsed.trace?.provider === 'apple' &&
			typeof parsed.trace.traceId === 'string' &&
			Array.isArray(parsed.trace.events)
		) {
			return parsed;
		}
	} catch {
		return null;
	}

	return null;
}

class AppleCookieStateStore {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	store(req: any, ...args: unknown[]): void {
		const callback = args[args.length - 1] as (err: Error | null, state?: string) => void;
		try {
			const nonce = crypto.randomBytes(32).toString('hex');
			const res = req.res;
			if (res?.cookie) {
				const cookieOptions = {
					...getAppleCookieTransportOptions(req),
					maxAge: 600_000,
				};
				res.cookie(APPLE_STATE_COOKIE, nonce, cookieOptions);
				recordAppleFlowEvent(req, 'info', 'state_cookie_set', 'Stored Apple OAuth state cookie', {
					cookieName: APPLE_STATE_COOKIE,
					sameSite: cookieOptions.sameSite,
					secure: cookieOptions.secure,
					stateEncoding: 'base64url-json',
				});
				if (!cookieOptions.secure) {
					recordAppleFlowEvent(
						req,
						'warn',
						'state_cookie_not_secure',
						'Apple OAuth state cookie is not marked Secure; browsers may reject SameSite=None cookies on non-HTTPS origins.',
						{
							host: req.headers?.host ?? null,
						}
					);
				}
			}
			recordAppleFlowEvent(req, 'info', 'state_payload_created', 'Embedded the current Apple flow trace into the OAuth state payload', {
				eventCount: getAppleFlowTrace(req).events.length,
			});
			const state = encodeAppleStatePayload({ nonce, trace: getAppleFlowTrace(req) });
			callback(null, state);
		} catch (err) {
			recordAppleFlowEvent(req, 'error', 'state_cookie_store_failed', 'Failed to store Apple OAuth state cookie', {
				error: err instanceof Error ? { name: err.name, message: err.message } : String(err),
			});
			callback(err as Error);
		}
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	verify(req: any, providedState: string, ...args: unknown[]): void {
		const callback = args[args.length - 1] as (err: Error | null, ok?: boolean, state?: string) => void;
		try {
			const storedState = req.cookies?.[APPLE_STATE_COOKIE];
			const parsedState = decodeAppleStatePayload(providedState);
			if (parsedState?.trace) {
				setAppleFlowTrace(req, parsedState.trace);
				recordAppleFlowEvent(req, 'info', 'trace_restored_from_state', 'Restored the pre-callback Apple flow trace from the OAuth state payload', {
					restoredEvents: parsedState.trace.events.length,
					traceId: parsedState.trace.traceId,
				});
			}
			const res = req.res;
			if (res?.clearCookie) {
				res.clearCookie(APPLE_STATE_COOKIE, {
					...getAppleCookieTransportOptions(req),
					path: '/',
				});
			}
			const providedNonce = parsedState?.nonce;
			if (!storedState || !providedNonce || storedState !== providedNonce) {
				recordAppleFlowEvent(req, 'warn', 'state_mismatch', 'Apple OAuth state validation failed', {
					hasStoredState: !!storedState,
					hasProvidedState: !!providedState,
					hasProvidedNonce: !!providedNonce,
					storedState:
						typeof storedState === 'string'
							? { length: storedState.length, previewStart: storedState.slice(0, 6), previewEnd: storedState.slice(-4) }
							: null,
					providedNonce:
						typeof providedNonce === 'string'
							? { length: providedNonce.length, previewStart: providedNonce.slice(0, 6), previewEnd: providedNonce.slice(-4) }
							: null,
				});
				callback(null, false);
			} else {
				recordAppleFlowEvent(req, 'info', 'state_verified', 'Apple OAuth state validation succeeded');
				callback(null, true, storedState);
			}
		} catch (err) {
			recordAppleFlowEvent(req, 'error', 'state_verify_failed', 'Apple OAuth state verification threw an exception', {
				error: err instanceof Error ? { name: err.name, message: err.message } : String(err),
			});
			callback(err as Error);
		}
	}
}

if (
	process.env.APPLE_CLIENT_ID &&
	process.env.APPLE_TEAM_ID &&
	process.env.APPLE_KEY_ID &&
	process.env.APPLE_PRIVATE_KEY &&
	process.env.APPLE_CALLBACK_URL
) {
	passport.use(
		new AppleStrategy(
			{
				clientID: process.env.APPLE_CLIENT_ID,
				teamID: process.env.APPLE_TEAM_ID,
				keyID: process.env.APPLE_KEY_ID,
				privateKeyString: normalizeApplePrivateKey(process.env.APPLE_PRIVATE_KEY),
				callbackURL: process.env.APPLE_CALLBACK_URL,
				responseType: 'code id_token',
				scope: ['name', 'email', 'profile'],
				passReqToCallback: true,
				store: new AppleCookieStateStore(),
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			} as any,
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			async (...args: unknown[]) => {
				const [req, _accessToken, _refreshToken, idToken, profile, done] = args as [
					{ appleProfile?: { email?: string } },
					string,
					string,
					string,
					{ id?: string } | undefined,
					(err: Error | null, user?: unknown) => void
				];
				const session = await mongoose.startSession();
				session.startTransaction();

				try {
					const decoded = jwt.decode(idToken) as { sub?: string; email?: string } | null;
					if (!decoded?.sub) {
						await session.abortTransaction();
						recordAppleFlowEvent(req as Request, 'error', 'id_token_decode_failed', 'Apple id_token could not be decoded', {
							idTokenPresent: !!idToken,
						});
						return done(new Error('Apple id_token could not be decoded'));
					}
					// Use profile.id (first login) or decoded.sub (subsequent logins) - per backup-branch
					const appleId = (profile?.id ?? decoded.sub) as string;
					const appleProfile = req?.appleProfile as { email?: string } | undefined;
					const emailFromToken = decoded.email;
					const emailFromProfile = appleProfile?.email;
					const email = emailFromToken ?? emailFromProfile ?? '';
					recordAppleFlowEvent(req as Request, 'info', 'id_token_decoded', 'Decoded Apple id_token and derived Apple identity', {
						appleId,
						emailFromToken,
						emailFromProfile,
						effectiveEmail: email || null,
						profile: sanitizeFlowDetails(profile as Record<string, unknown> | undefined),
					});

					const byAppleId = await UserAuth.findOne({ appleId }).populate('user').session(session);
					if (byAppleId?.user) {
						await session.abortTransaction();
						logger.info('Apple sign-in by appleId', { appleId });
						recordAppleFlowEvent(req as Request, 'info', 'user_found_by_apple_id', 'Matched Apple account to an existing linked user', {
							appleId,
							userId: byAppleId.user._id,
						});
						return done(null, byAppleId.user as unknown as Express.User);
					}

					const effectiveEmail = email || getApplePlaceholderEmail(appleId);
					recordAppleFlowEvent(req as Request, 'info', 'effective_email_selected', 'Selected the email that will be used for Apple sign-in', {
						effectiveEmail,
						usedPlaceholder: !email,
					});
					const { user, created } = await findOrCreateUserByEmail(effectiveEmail, session);
					const existingAuth = await UserAuth.findOne({ user: user._id }).session(session);
					if (existingAuth) {
						if (existingAuth.appleId && existingAuth.appleId !== appleId) {
							await session.abortTransaction();
							recordAppleFlowEvent(req as Request, 'error', 'apple_account_conflict', 'This email is already linked to a different Apple account', {
								userId: user._id,
								existingAppleId: existingAuth.appleId,
								incomingAppleId: appleId,
							});
							return done(new Error('Apple account conflict: this email is already linked to a different Apple account'));
						}
						if (!existingAuth.appleId) {
							existingAuth.appleId = appleId;
							await existingAuth.save({ session });
							logger.info('Linked appleId to existing user', { userId: user._id });
							recordAppleFlowEvent(req as Request, 'info', 'apple_id_linked', 'Linked Apple identity to an existing user account', {
								userId: user._id,
								appleId,
							});
						}
					} else {
						await UserAuth.create([{ user: user._id, appleId }], { session });
						recordAppleFlowEvent(req as Request, 'info', 'user_auth_created', 'Created a new auth link for the Apple identity', {
							userId: user._id,
							appleId,
						});
					}

					await session.commitTransaction();
					logger.info(created ? 'Apple sign-up: new user created' : 'Apple sign-in by email', {
						userId: user._id,
						usedPlaceholder: !email,
					});
					recordAppleFlowEvent(req as Request, 'info', created ? 'user_created' : 'user_found_by_email', created ? 'Created a new user from Apple sign-in' : 'Matched Apple sign-in to an existing user by email', {
						userId: user._id,
						usedPlaceholder: !email,
					});
					return done(null, user as Express.User);
				} catch (error) {
					await session.abortTransaction();
					logger.error('Apple strategy error', { error });
					recordAppleFlowEvent(req as Request, 'error', 'strategy_error', 'Apple strategy failed while linking or creating the user', {
						error: error instanceof Error ? { name: error.name, message: error.message } : String(error),
					});
					return done(error as Error);
				} finally {
					await session.endSession();
				}
			}
		)
	);
} else {
	logger.warn('Apple OAuth strategy not registered — missing environment variables');
}

// ---------------------------------------------------------------------------
// Serialize / Deserialize
// ---------------------------------------------------------------------------
passport.serializeUser((user: Express.User, done) => {
	const typedUser = user as UserDocument;
	done(null, typedUser._id.toString());
});

passport.deserializeUser(async (id: string, done) => {
	try {
		const user = await User.findById(id)
			.select('_id email name alias role adminOf organizerOf')
			.lean();
		if (!user) {
			return done(null, false);
		}
		done(null, user as Express.User);
	} catch (error) {
		logger.error('deserializeUser error', { error, id });
		done(error as Error);
	}
});
