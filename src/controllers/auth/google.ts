import passport from 'passport';
import type { Request, Response, NextFunction } from 'express';
import User from '../../models/User';
import UserAuth from '../../models/UserAuth';
import { createTokenAndSession, isSignupComplete } from './session';
import type { GoogleProfile } from './types';

export const googleAuth = passport.authenticate('google', {
	scope: ['profile', 'email']
});

export const googleAuthCallback = (req: Request, res: Response, next: NextFunction) => {
	passport.authenticate('google', async (err: { message: string }, profile: GoogleProfile) => {
		if (err || !profile?.id) {
			return res.status(500).json({ message: 'Authentication error', error: err?.message });
		}

		const userAuth = await UserAuth.findOne({ googleId: profile.id }).exec();
		if (!userAuth) {
			return res.redirect(`${process.env.REQUEST_ORIGIN}/auth/callback?error=true`);
		}

		const user = await User.findById(userAuth.user).exec();
		if (!user) {
			return res.redirect(`${process.env.REQUEST_ORIGIN}/auth/callback?error=true`);
		}

		if (!isSignupComplete(user)) {
			const email = profile.emails?.[0]?.value ?? user.email;
			return res.redirect(`${process.env.REQUEST_ORIGIN}/auth/callback?signup=true&email=${email}`);
		}

		const token = await createTokenAndSession(user._id, userAuth.hmacKey);
		res.redirect(`${process.env.REQUEST_ORIGIN}/auth/callback?token=${token}`);
	})(req, res, next);
};
