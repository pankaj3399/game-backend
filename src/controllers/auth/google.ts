import passport from 'passport';
import type { Request, Response, NextFunction } from 'express';
import User from '../../models/User';
import UserAuth from '../../models/UserAuth';
import { isSignupComplete } from './utils';
import { createPendingSignupToken } from './pendingToken';
import { getErrorRedirect, getSuccessRedirect, getSignupRedirect } from './utils';
import { logger } from '../../lib/logger';

export const googleAuth = (req: Request, res: Response, next: NextFunction) => {
	passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
};

/**
 * Google OAuth callback. Two paths:
 * - Sign-in (existing user, signup complete): Create session only, redirect home.
 * - Sign-up (first-time user): Redirect with signed pendingToken for complete-signup.
 */
export const googleAuthCallback = (req: Request, res: Response, next: NextFunction) => {
	passport.authenticate('google', async (err: { message?: string }, user: Express.User | false) => {
		try {
			if (err || !user) {
				return res.redirect(getErrorRedirect());
			}

			const userAuth = await UserAuth.findOne({ user: user._id }).exec();
			if (!userAuth) {
				return res.redirect(getErrorRedirect());
			}

			if (!isSignupComplete(user)) {
				const email = user.email ?? '';
				const googleId = userAuth.googleId ?? '';
				const pendingToken = createPendingSignupToken({
					pendingEmail: email,
					googleId: googleId || undefined,
				});
				return res.redirect(getSignupRedirect(pendingToken));
			}

			req.session.regenerate((regenErr) => {
				if (regenErr) {
					logger.error("Error in googleAuthCallback session regenerate", { regenErr });
					return res.redirect(getErrorRedirect());
				}
				req.login(user, (loginErr) => {
					if (loginErr) {
						logger.error("Error in googleAuthCallback login", { loginErr });
						return res.redirect(getErrorRedirect());
					}
					req.session.save((saveErr) => {
						if (saveErr) {
							logger.error("Error in googleAuthCallback session save", { saveErr });
							return res.redirect(getErrorRedirect());
						}
						res.redirect(getSuccessRedirect());
					});
				});
			});
		} catch {
			logger.error("Error in googleAuthCallback");
			return res.redirect(getErrorRedirect('unknown'));
		}
	})(req, res, next);
};
