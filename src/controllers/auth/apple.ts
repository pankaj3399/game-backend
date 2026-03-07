import { randomBytes } from 'crypto';
import passport from 'passport';
import type { Request, Response, NextFunction } from 'express';
import UserAuth from '../../models/UserAuth';
import { createPendingSignupToken } from './pendingToken';
import {
	clearAppleNonce,
	encodeAppleFlowTrace,
	finalizeAppleFlow,
	persistAppleFlowTrace,
	persistAppleNonce,
	recordAppleFlowEvent,
	sanitizeApplePayload,
	clearAppleFlowTrace,
} from './appleFlow';
import {
	getErrorRedirect,
	getSignupRedirect,
	isSignupComplete,
	loginAndRedirect,
} from './utils';
import { logger } from '../../lib/logger';

/** Safely extracts error message from unknown error. */
function getErrorMessage(err: unknown): string {
	if (err instanceof Error) return err.message;
	if (typeof err === 'string') return err;
	return String(err);
}

function getAppleErrorKind(err: unknown): string {
	const message = getErrorMessage(err).toLowerCase();
	if (err === 'AuthorizationError' || message.includes('access_denied')) return 'denied';
	if (err === 'TokenError' || message.includes('token')) return 'token';
	if (message.includes('state')) return 'state_mismatch';
	if (message.includes('strategy') && message.includes('unknown')) return 'strategy_missing';
	if (message.includes('session')) return 'session';
	return 'auth';
}

function getCallbackSource(req: Request): Record<string, unknown> {
	const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
	if (Object.keys(body).length > 0) return body;
	return req.query as Record<string, unknown>;
}

function getStringField(source: Record<string, unknown>, key: string): string | null {
	const value = source[key];
	return typeof value === 'string' && value.trim() ? value : null;
}

/**
 * Express 5 defines req.query as a computed getter that returns a new object
 * each time. passport-apple merges form_post body fields into req.query, but
 * those mutations are silently lost. This middleware snapshots req.query into
 * a plain writable property so passport-apple's merging actually persists.
 *
 * Only needed on POST (Apple's form_post callback).
 */
export const appleFormPostFix = (req: Request, _res: Response, next: NextFunction) => {
	recordAppleFlowEvent(req, 'info', 'form_post_fix_entered', 'Normalizing Apple form_post callback payload', {
		bodyKeys: req.body && typeof req.body === 'object' ? Object.keys(req.body as Record<string, unknown>) : [],
		queryKeys: Object.keys(req.query ?? {}),
	});
	if (req.body) {
		Object.defineProperty(req, 'query', {
			value: { ...req.query },
			writable: true,
			configurable: true,
		});
	}
	next();
};

export const appleAuth = (req: Request, res: Response, next: NextFunction) => {
	recordAppleFlowEvent(req, 'info', 'auth_start', 'Starting Apple sign-in redirect', {
		method: req.method,
		originalUrl: req.originalUrl,
	});
	persistAppleFlowTrace(req);

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const strategy = (passport as any)._strategy?.('apple');
	if (!strategy) {
		finalizeAppleFlow(req, 'error', 'strategy_missing', 'Apple sign-in is not configured on the server.');
		recordAppleFlowEvent(req, 'error', 'strategy_missing', 'Apple strategy is not registered', {
			callbackUrl: process.env.APPLE_CALLBACK_URL ?? null,
		});
		clearAppleFlowTrace(req);
		return res.redirect(
			getErrorRedirect('strategy_missing', {
				errorMessage: 'Apple sign-in is not configured on the server.',
				flowTrace: encodeAppleFlowTrace(req),
			})
		);
	}

	// state: {} keeps passport-oauth2 on the state-store code path. passport-apple
	// mutates the options object and will generate its own random string when state
	// is falsy; using an object prevents that so our SameSite=None cookie store is
	// used for Apple's cross-site form_post callback.
	recordAppleFlowEvent(req, 'info', 'redirecting_to_apple', 'Redirecting the browser to Apple', {
		callbackUrl: process.env.APPLE_CALLBACK_URL ?? null,
	});
	persistAppleFlowTrace(req);
	const nonce = randomBytes(32).toString('hex');
	persistAppleNonce(req, nonce);
	const appleAuthOptions = {
		scope: ['name', 'email'],
		nonce,
		state: {} as unknown as string,
		session: false,
	};
	// passport-apple supports auto-managed state stores, but its typings still expect state:string.
	passport.authenticate('apple', appleAuthOptions)(req, res, next);
};

/**
 * Apple OAuth callback. Two paths:
 * - Sign-in (existing user, signup complete): Create session only, redirect home.
 * - Sign-up (first-time user): Redirect with signed pendingToken for complete-signup.
 *
 * On error: redirects to frontend with error details and Apple payload for display.
 */
export const appleAuthCallback = (req: Request, res: Response, next: NextFunction) => {
	const callbackSource = getCallbackSource(req);
	let applePayload: Record<string, unknown> = {};

	try {
		applePayload = sanitizeApplePayload(callbackSource);
	} catch (e) {
		applePayload = { _captureError: String(e), body: req.body, query: req.query };
	}

	const redirectOnError = (kind: string, err?: unknown) => {
		const errorMessage = err ? getErrorMessage(err) : kind;
		finalizeAppleFlow(req, 'error', kind, errorMessage);
		recordAppleFlowEvent(req, 'error', kind, 'Apple callback failed', {
			errorMessage,
			applePayload,
			error: err instanceof Error ? { name: err.name, message: err.message } : err ?? null,
		});
		logger.warn('Apple auth error', { kind, err, applePayload });
		const flowTrace = encodeAppleFlowTrace(req);
		clearAppleNonce(req);
		clearAppleFlowTrace(req);
		res.redirect(getErrorRedirect(kind, { errorMessage, applePayload, flowTrace }));
	};

	try {
		recordAppleFlowEvent(req, 'info', 'callback_received', 'Received Apple callback request', {
			method: req.method,
			originalUrl: req.originalUrl,
			bodyKeys: req.body && typeof req.body === 'object' ? Object.keys(req.body as Record<string, unknown>) : [],
			queryKeys: Object.keys(req.query ?? {}),
		});
		recordAppleFlowEvent(req, 'info', 'callback_payload_captured', 'Captured Apple callback payload summary', {
			applePayload,
		});

		const appleError = getStringField(callbackSource, 'error');
		const appleErrorDescription = getStringField(callbackSource, 'error_description');
		const state = getStringField(callbackSource, 'state');
		const code = getStringField(callbackSource, 'code');
		const idToken = getStringField(callbackSource, 'id_token');
		const user = getStringField(callbackSource, 'user');

		if (appleError || appleErrorDescription) {
			recordAppleFlowEvent(req, 'warn', 'apple_returned_error', 'Apple returned an OAuth error before Passport completed', {
				error: appleError,
				errorDescription: appleErrorDescription,
				applePayload,
			});
			return redirectOnError('apple_error', appleErrorDescription ?? appleError ?? 'Apple returned an error');
		}

		if (!state) {
			recordAppleFlowEvent(req, 'warn', 'missing_state', 'Apple callback is missing the OAuth state parameter', {
				applePayload,
			});
		}

		if (!code && !idToken) {
			recordAppleFlowEvent(req, 'warn', 'invalid_callback', 'Apple callback is missing both code and id_token', {
				applePayload,
			});
			return redirectOnError(
				'invalid_callback',
				'Apple callback did not include an authorization code or id_token.'
			);
		}

		recordAppleFlowEvent(req, 'info', 'callback_shape_valid', 'Apple callback includes the expected OAuth fields', {
			hasState: !!state,
			hasCode: !!code,
			hasIdToken: !!idToken,
			hasUser: !!user,
		});

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		passport.authenticate('apple', { session: false }, async (err: Error | string | null, user: Express.User | false) => {
		try {
			if (err) {
				const kind = getAppleErrorKind(err);
				recordAppleFlowEvent(req, kind === 'state_mismatch' ? 'warn' : 'error', kind, 'Passport reported an Apple authentication error', {
					errorMessage: getErrorMessage(err),
				});
				return redirectOnError(kind, err);
			}

			if (!user) {
				recordAppleFlowEvent(req, 'warn', 'no_user', 'Passport completed without returning a user', {
					applePayload,
				});
				return redirectOnError('no_user');
			}
			recordAppleFlowEvent(req, 'info', 'passport_user_resolved', 'Passport resolved an application user from Apple identity', {
				userId: user._id,
			});

			const userAuth = await UserAuth.findOne({ user: user._id }).exec();
			if (!userAuth) {
				recordAppleFlowEvent(req, 'error', 'no_user_auth', 'User exists but no linked auth record was found', {
					userId: user._id,
				});
				return redirectOnError('no_user_auth');
			}

			if (!isSignupComplete(user)) {
				const email = user.email ?? '';
				const appleId = userAuth.appleId ?? '';
				const pendingToken = createPendingSignupToken({
					pendingEmail: email,
					...(appleId && { appleId }),
					...(email.startsWith('apple-') && email.endsWith('@users.noreply.local')
						? { requiresEmailInput: true }
						: {}),
				});
				finalizeAppleFlow(
					req,
					'signup_required',
					'signup_required',
					'Apple authentication succeeded, but the user still needs to complete profile setup.'
				);
				recordAppleFlowEvent(req, 'info', 'signup_required', 'Apple sign-in succeeded and the user is being sent to complete signup', {
					userId: user._id,
					hasAppleId: !!appleId,
					email,
				});
				const flowTrace = encodeAppleFlowTrace(req);
				clearAppleNonce(req);
				clearAppleFlowTrace(req);
				return res.redirect(getSignupRedirect(pendingToken, flowTrace));
			}

			finalizeAppleFlow(req, 'success', 'success', 'Apple sign-in succeeded and the user was logged in.');
			recordAppleFlowEvent(req, 'info', 'login_redirect', 'Apple sign-in completed successfully; creating session and redirecting', {
				userId: user._id,
			});
			clearAppleNonce(req);
			clearAppleFlowTrace(req);
			await loginAndRedirect(req, res, user);
		} catch (caught) {
			logger.error('Error in appleAuthCallback', { err: caught, applePayload });
			redirectOnError('unknown', caught);
		}
		})(req, res, (passportErr: unknown) => {
			if (passportErr) {
				recordAppleFlowEvent(req, 'error', 'passport', 'Passport middleware raised an error before the verify callback completed', {
					errorMessage: getErrorMessage(passportErr),
				});
				redirectOnError('passport', passportErr);
			} else {
				next();
			}
		});
	} catch (e) {
		redirectOnError('crash', e);
	}
};
