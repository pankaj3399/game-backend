import type { Request, Response } from 'express';
import { LogError } from '../../lib/logger';
import User from '../../models/User';
import UserAuth from '../../models/UserAuth';
import type { ICompleteSignup } from './types';
import { createTokenAndSession } from './session';

const DEFAULT_ELO = { rating: 1500, tau: 0.5, rd: 200, vol: 0.06 };

export async function completeSignUp(req: Request, res: Response) {
	const data: ICompleteSignup = req.body;
	if (!data?.email) return res.status(400).json({ message: 'Email is required', error: true, code: 'WARNING' });
	if (!data?.alias) return res.status(400).json({ message: 'Alias is required', error: true, code: 'WARNING' });
	if (!data?.name) return res.status(400).json({ message: 'Name is required', error: true, code: 'WARNING' });

	try {
		if (!data?.appleId || data.appleId.trim() === '') {
			// Google (or email-only) path: find User by email, get hmacKey from UserAuth
			const user = await User.findOne({ email: data.email }).exec();
			if (!user)
				return res
					.status(404)
					.json({ message: 'No user found with email address. Please login', error: true, code: 'NO_USER_FOUND' });

			const userAuth = await UserAuth.findOne({ user: user._id }).exec();
			if (!userAuth)
				return res
					.status(500)
					.json({ message: 'Auth record not found', error: true, code: 'SIGN_UP_FAILED' });

			await User.findByIdAndUpdate(user._id, {
				alias: data.alias,
				name: data.name,
				dateOfBirth: data.dateOfBirth ?? null,
				gender: data.gender && data.gender !== '' ? data.gender : null,
				elo: DEFAULT_ELO
			});

			const token = await createTokenAndSession(user._id, userAuth.hmacKey);
			res.status(200).json({ message: 'Sign up completed', code: 'SIGNUP_SUCCESSFUL', error: false, token });
		} else {
			// Apple path: find UserAuth by appleId, then update linked User
			const userAuth = await UserAuth.findOne({ appleId: data.appleId }).exec();
			if (!userAuth)
				return res
					.status(404)
					.json({ message: 'No user found. Please login with Apple.', error: true, code: 'NO_USER_FOUND' });

			const user = await User.findById(userAuth.user).exec();
			if (!user)
				return res
					.status(500)
					.json({ message: 'User record not found', error: true, code: 'SIGN_UP_FAILED' });

			await User.findByIdAndUpdate(userAuth.user, {
				email: data.email,
				alias: data.alias,
				name: data.name,
				dateOfBirth: data.dateOfBirth,
				gender: data.gender,
				elo: DEFAULT_ELO
			});

			const token = await createTokenAndSession(userAuth.user, userAuth.hmacKey);
			res.status(200).json({ message: 'Sign up completed', code: 'SIGNUP_SUCCESSFUL', error: false, token });
		}
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} catch (error: any) {
		LogError(__dirname, 'POST', req.originalUrl, error);
		res.status(500).json({ message: error.message, code: 'SIGN_UP_FAILED', error: true });
	}
}
