import passport from 'passport';
import type { Request, Response, NextFunction } from 'express';
import UserAuth from '../../models/UserAuth';
import { createPendingSignupToken } from './pendingToken';
import {
	getErrorRedirect,
	getSignupRedirect,
	isSignupComplete,
	loginAndRedirect,
} from './utils';
import { clearExistingSession } from './logout';
import { logger } from '../../lib/logger';
import { isApplePlaceholderEmail } from '../../lib/passport';

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

/**
 * Express 5 defines req.query as a computed getter that returns a new object
 * each time. passport-apple merges form_post body fields into req.query, but
 * those mutations are silently lost. This middleware snapshots req.query into
 * a plain writable property so passport-apple's merging actually persists.
 *
 * Only needed on POST (Apple's form_post callback).
 */
export const appleFormPostFix = (req: Request, _res: Response, next: NextFunction) => {
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
	clearExistingSession(req, res);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const strategy = (passport as any)._strategy?.('apple');
	if (!strategy) {
		return res.redirect(getErrorRedirect('strategy_missing', { errorMessage: 'Apple sign-in is not configured on the server.' }));
	}

	passport.authenticate('apple', {
		scope: ['name', 'email'],
		// passport-apple injects its own string state unless a truthy non-string value is provided.
		state: { provider: 'apple' } as unknown as string,
		session: false,
	})(req, res, next);
};

/**
 * Apple OAuth callback. Two paths:
 * - Sign-in (existing user, signup complete): Create session only, redirect home.
 * - Sign-up (first-time user): Redirect with signed pendingToken for complete-signup.
 *
 * On error: redirects to frontend with an auth error.
 */
export const appleAuthCallback = (req: Request, res: Response, next: NextFunction) => {
	const callbackSource =
		req.body && typeof req.body === 'object' && Object.keys(req.body as Record<string, unknown>).length > 0
			? (req.body as Record<string, unknown>)
			: (req.query as Record<string, unknown>);
	const appleError = typeof callbackSource.error === 'string' ? callbackSource.error : null;
	const appleErrorDescription =
		typeof callbackSource.error_description === 'string' ? callbackSource.error_description : null;

	if (appleError || appleErrorDescription) {
		return res.redirect(
			getErrorRedirect('apple_error', {
				errorMessage: appleErrorDescription ?? appleError ?? 'Apple returned an error',
			})
		);
	}

	passport.authenticate(
		'apple',
		{ session: false },
		async (err: Error | string | null, user: Express.User | false, info?: { message?: string }) => {
			try {
				if (err) {
					const kind = getAppleErrorKind(err);
					logger.warn('Apple auth error', { kind, errorMessage: getErrorMessage(err) });
					return res.redirect(getErrorRedirect(kind, { errorMessage: getErrorMessage(err) }));
				}

				if (!user) {
					const message = info?.message;
					const kind = message?.toLowerCase().includes('state') ? 'state_mismatch' : 'no_user';
					return res.redirect(getErrorRedirect(kind, { errorMessage: message }));
				}

				const userAuth = await UserAuth.findOne({ user: user._id }).exec();
				if (!userAuth) {
					return res.redirect(getErrorRedirect('no_user_auth'));
				}

				if (!isSignupComplete(user)) {
					const email = user.email ?? '';
					const appleId = userAuth.appleId ?? '';
					const pendingToken = createPendingSignupToken({
						pendingEmail: email,
						...(appleId && { appleId }),
						...(isApplePlaceholderEmail(email) ? { requiresEmailInput: true } : {}),
					});
					return res.redirect(getSignupRedirect(pendingToken));
				}

				await loginAndRedirect(req, res, user);
			} catch (caught) {
				logger.error('Error in appleAuthCallback', { err: caught });
				return res.redirect(getErrorRedirect('unknown'));
			}
		}
	)(req, res, next);
};
