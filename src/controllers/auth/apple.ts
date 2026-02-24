import passport from 'passport';
import type { Request, Response, NextFunction } from 'express';
import User from '../../models/User';
import UserAuth from '../../models/UserAuth';
import { isSignupComplete } from './utils';
import { createPendingSignupToken } from './pendingToken';
import { getErrorRedirect, getSuccessRedirect, getSignupRedirect } from './utils';
import { logger } from '../../lib/logger';

export const appleAuth = passport.authenticate('apple', {
	scope: ['name', 'email']
});

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
					appleId: appleId || undefined,
				});
				return res.redirect(getSignupRedirect(pendingToken));
			}

			req.session.regenerate((regenErr) => {
				if (regenErr) {
					logger.error("Error in appleAuthCallback session regenerate", { regenErr });
					return res.redirect(getErrorRedirect());
				}
				req.login(user, (loginErr) => {
					if (loginErr) {
						logger.error("Error in appleAuthCallback login", { loginErr });
						return res.redirect(getErrorRedirect());
					}
					req.session.save((saveErr) => {
						if (saveErr) {
							logger.error("Error in appleAuthCallback session save", { saveErr });
							return res.redirect(getErrorRedirect());
						}
						res.redirect(getSuccessRedirect());
					});
				});
			});
		} catch {
			logger.error("Error in appleAuthCallback");
			return res.redirect(getErrorRedirect('unknown'));
		}
	})(req, res, next);
};
