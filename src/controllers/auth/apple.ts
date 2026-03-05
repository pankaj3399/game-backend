import passport from 'passport';
import type { Request, Response, NextFunction } from 'express';
import UserAuth from '../../models/UserAuth';
import { isSignupComplete } from './utils';
import { createPendingSignupToken } from './pendingToken';
import { getErrorRedirect, getSignupRedirect, loginAndRedirect } from './utils';
import { logger } from '../../lib/logger';
import { isApplePlaceholderEmail } from '../../lib/passport';

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
 */
export const appleAuthCallback = (req: Request, res: Response, next: NextFunction) => {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	passport.authenticate('apple', async (err: Error | string | null, user: Express.User | false) => {
		try {
			if (err) {
				logger.warn('Apple passport.authenticate error', { err });
				if (err === 'AuthorizationError') return res.redirect(getErrorRedirect('denied'));
				if (err === 'TokenError') return res.redirect(getErrorRedirect('token'));
				return res.redirect(getErrorRedirect());
			}

			if (!user) return res.redirect(getErrorRedirect());
			const userAuth = await UserAuth.findOne({ user: user._id }).exec();
			if (!userAuth) return res.redirect(getErrorRedirect());

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
		} catch (err) {
			logger.error('Error in appleAuthCallback', { err });
			return res.redirect(getErrorRedirect('unknown'));
		}
	})(req, res, next);
};
