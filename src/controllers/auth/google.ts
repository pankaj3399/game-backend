import passport from 'passport';
import type { Request, Response, NextFunction } from 'express';
import User from '../../models/User';
import UserAuth from '../../models/UserAuth';
import { isSignupComplete } from './utils';
import { createPendingSignupToken } from './pendingToken';
import { getErrorRedirect, getSignupRedirect, loginAndRedirect } from './utils';
import { logger } from '../../lib/logger';

export const googleAuth = (req: Request, res: Response, next: NextFunction) => {
	passport.authenticate('google', { scope: ['profile', 'email'], session: false })(req, res, next);
};

/**
 * Google OAuth callback. Two paths:
 * - Sign-in (existing user, signup complete): Create session only, redirect home.
 * - Sign-up (first-time user): Redirect with signed pendingToken for complete-signup.
 */
export const googleAuthCallback = (req: Request, res: Response, next: NextFunction) => {
	passport.authenticate('google', { session: false }, async (err: { message?: string }, user: Express.User | false) => {
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
					...(googleId && { googleId }),
				});
				return res.redirect(getSignupRedirect(pendingToken));
			}

			await loginAndRedirect(req, res, user);
		} catch (err) {
			logger.error('Error in googleAuthCallback', { err });
			return res.redirect(getErrorRedirect('unknown'));
		}
	})(req, res, next);
};
