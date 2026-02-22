import passport from 'passport';
import type { Request, Response, NextFunction } from 'express';
import User from '../../models/User';
import UserAuth from '../../models/UserAuth';
import { createTokenAndSession, isSignupComplete } from './session';
import type { AppleProfile } from './types';

export const appleAuth = passport.authenticate('apple', {
	scope: ['profile', 'email']
});

export const appleAuthCallback = (req: Request, res: Response, next: NextFunction) => {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	passport.authenticate('apple', async (err: any, profile: AppleProfile) => {
		if (err) {
			if (err == 'AuthorizationError') {
				res.send("Oops! Looks like you didn't allow the app to proceed.");
			} else if (err == 'TokenError') {
				res.send("Oops! Couldn't get a valid token from Apple's servers!");
			} else {
				res.send(err);
			}
			return;
		}

		if (!profile?.sub) {
			return res.redirect(`${process.env.REQUEST_ORIGIN}/auth/callback?error=true`);
		}

		const userAuth = await UserAuth.findOne({ appleId: profile.sub }).exec();
		if (!userAuth) {
			return res.redirect(`${process.env.REQUEST_ORIGIN}/auth/callback?error=true`);
		}

		const user = await User.findById(userAuth.user).exec();
		if (!user) {
			return res.redirect(`${process.env.REQUEST_ORIGIN}/auth/callback?error=true`);
		}

		if (!isSignupComplete(user)) {
			return res.redirect(
				`${process.env.REQUEST_ORIGIN}/auth/callback?signup=true&apple_id=${userAuth.appleId ?? ''}&email=${profile?.email ?? user.email}`
			);
		}

		const token = await createTokenAndSession(user._id, userAuth.hmacKey);
		res.redirect(`${process.env.REQUEST_ORIGIN}/auth/callback?token=${token}`);
	})(req, res, next);
};
