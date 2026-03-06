import passport from 'passport';
import type { Request, Response, NextFunction } from 'express';
import UserAuth from '../../models/UserAuth';
import { createPendingSignupToken } from './pendingToken';
import {
	isSignupComplete,
	getSignupRedirect,
	loginAndRedirect,
	renderAppleErrorPage,
	sanitizeApplePayload,
} from './utils';
import { logger } from '../../lib/logger';
import { isApplePlaceholderEmail } from '../../lib/passport';

/** Safely extracts error message from unknown error. */
function getErrorMessage(err: unknown): string {
	if (err instanceof Error) return err.message;
	if (typeof err === 'string') return err;
	return String(err);
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
	passport.authenticate('apple', { scope: ['name', 'email'] })(req, res, next);
};

/**
 * Apple OAuth callback. Two paths:
 * - Sign-in (existing user, signup complete): Create session only, redirect home.
 * - Sign-up (first-time user): Redirect with signed pendingToken for complete-signup.
 *
 * On error: renders HTML debug page with error + Apple payload (no redirect).
 */
export const appleAuthCallback = (req: Request, res: Response, next: NextFunction) => {
	let applePayload: Record<string, unknown> = {};

	try {
		applePayload = sanitizeApplePayload(
			(req.body as Record<string, unknown>) ?? (req.query as Record<string, unknown>)
		);
	} catch (e) {
		applePayload = { _captureError: String(e), body: req.body, query: req.query };
	}

	const showError = (kind: string, err?: unknown) => {
		logger.warn('Apple auth error', { kind, err, applePayload });
		const errorMessage = err ? getErrorMessage(err) : kind;
		renderAppleErrorPage(res, errorMessage, applePayload, kind);
	};

	try {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		passport.authenticate('apple', async (err: Error | string | null, user: Express.User | false) => {
		try {
			if (err) {
				if (err === 'AuthorizationError') return showError('denied', err);
				if (err === 'TokenError') return showError('token', err);
				return showError('auth', err);
			}

			if (!user) return showError('no_user');
			const userAuth = await UserAuth.findOne({ user: user._id }).exec();
			if (!userAuth) return showError('no_user_auth');

			if (!isSignupComplete(user)) {
				const email = user.email ?? '';
				const appleId = userAuth.appleId ?? '';
				const pendingToken = createPendingSignupToken({
					pendingEmail: email,
					...(appleId && { appleId }),
					...(appleId && isApplePlaceholderEmail(email) && { requiresEmailInput: true }),
				});
				return res.redirect(getSignupRedirect(pendingToken));
			}

			await loginAndRedirect(req, res, user);
		} catch (caught) {
			logger.error('Error in appleAuthCallback', { err: caught, applePayload });
			showError('unknown', caught);
		}
		})(req, res, (passportErr: unknown) => {
			if (passportErr) {
				showError('passport', passportErr);
			} else {
				next();
			}
		});
	} catch (e) {
		showError('crash', e);
	}
};
