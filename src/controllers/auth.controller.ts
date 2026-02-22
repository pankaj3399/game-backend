import passport from 'passport';
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { ICompleteSignup } from '../types/types';
import Session from '../models/session';
import { LogError } from '../utils/logs';
import User, { IUser } from '../models/user';
import Favorite from '../models/favorite';

export const googleAuth = passport.authenticate('google', {
	scope: ['profile', 'email']
});

export const googleAuthCallback = (req: Request, res: Response, next: NextFunction) => {
	passport.authenticate('google', async (err: { message: string }, user: IUser) => {
		if (err || !user) {
			return res.status(500).json({ message: 'Authentication error', error: err?.message });
		}

		const isUser = await User.findOne({ email: user.email });

		// If user not exists
		if (!isUser) {
			return res.redirect(`${process.env.REQUEST_ORIGIN}/auth/callback?error=true`);
		}

		// If user exits but not signed up yet on the system
		if (isUser && !isUser?.alias && !isUser?.name && !isUser?.dateOfBirth && !isUser?.gender) {
			return res.redirect(`${process.env.REQUEST_ORIGIN}/auth/callback?signup=true&email=${user.email}`);
		}

		const token = jwt.sign({ userId: isUser.hmacKey }, process.env.JWT_SECRET as string, { expiresIn: '7d' });
		const session = new Session({
			token,
			user: isUser?._id
		});
		await session.save();
		res.redirect(`${process.env.REQUEST_ORIGIN}/auth/callback?token=${token}`);
	})(req, res, next);
};

export const appleAuth = passport.authenticate('apple', {
	scope: ['profile', 'email']
});

export const appleAuthCallback = (req: Request, res: Response, next: NextFunction) => {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	passport.authenticate('apple', async (err: any, user: IUser) => {
		if (err) {
			if (err == 'AuthorizationError') {
				res.send("Oops! Looks like you didn't allow the app to proceed.");
			} else if (err == 'TokenError') {
				res.send("Oops! Couldn't get a valid token from Apple's servers!");
			} else {
				res.send(err);
			}
		}

		const isUser = await User.findOne({ appleId: user.appleId });
		// If user not exists
		if (!isUser) {
			return res.redirect(`${process.env.REQUEST_ORIGIN}/auth/callback?error=true`);
		}

		// If user exits but not signed up yet on the system
		if (isUser && !isUser?.alias && !isUser?.name && !isUser?.dateOfBirth && !isUser?.gender) {
			return res.redirect(
				`${process.env.REQUEST_ORIGIN}/auth/callback?signup=true&apple_id=${isUser?.appleId}&email=${user?.email}`
			);
		}

		const token = jwt.sign({ userId: isUser.hmacKey }, process.env.JWT_SECRET as string, { expiresIn: '7d' });
		const session = new Session({
			token,
			user: isUser?._id
		});
		await session.save();
		res.redirect(`${process.env.REQUEST_ORIGIN}/auth/callback?token=${token}`);
	})(req, res, next);
};

export const completeSignUp = async (req: Request, res: Response) => {
	const data: ICompleteSignup = req.body;
	if (!data?.email) return res.status(400).json({ message: 'Email is required', error: true, code: 'WARNING' });
	if (!data?.alias) return res.status(400).json({ message: 'Alias is required', error: true, code: 'WARNING' });
	if (!data?.name) return res.status(400).json({ message: 'Name is required', error: true, code: 'WARNING' });
	// if (!data?.gender) return res.status(400).json({ message: 'Gender is required', error: true, code: 'WARNING' });
	// if (!data?.dateOfBirth)
	// 	return res.status(400).json({ message: 'Date of birth is required', error: true, code: 'WARNING' });

	try {
		if (data?.appleId?.trim() === '') {
			const isUser = await User.findOne({ email: data?.email });
			if (!isUser)
				return res
					.status(404)
					.json({ message: 'No user found with email address. Please login', error: true, code: 'NO_USER_FOUND' });

			// If exist update the user details
			const user = await User.findByIdAndUpdate(isUser?._id, {
				alias: data?.alias,
				name: data?.name,
				dateOfBirth: data?.dateOfBirth ? data?.dateOfBirth : null,
				gender: data?.gender && data?.gender !== '' ? data?.gender : null,
				elo: {
					rating: 1500,
					tau: 0.5,
					rd: 200,
					vol: 0.06
				}
			});

			if (data?.club) {
				await Favorite.create({ user: user?._id, club: data?.club });
			}

			const token = jwt.sign({ userId: isUser.hmacKey }, process.env.JWT_SECRET as string, { expiresIn: '7d' });
			const session = new Session({
				token,
				user: isUser?._id
			});
			await session.save();
			res.status(200).json({ message: 'Sign up completed', code: 'SIGNUP_SUCCESSFUL', error: false, token });
		} else {
			const isUser = await User.findOne({ appleId: data?.appleId });
			if (!isUser)
				return res
					.status(404)
					.json({ message: 'No user found with email address. Please login', error: true, code: 'NO_USER_FOUND' });

			// If exist update the user details
			const user = await User.findByIdAndUpdate(isUser?._id, {
				email: data?.email,
				alias: data?.alias,
				name: data?.name,
				dateOfBirth: data?.dateOfBirth,
				gender: data?.gender,
				elo: {
					rating: 1500,
					tau: 0.5,
					rd: 200,
					vol: 0.06
				}
			});

			if (data?.club) {
				await Favorite.create({ user: user?._id, club: data?.club });
			}

			const token = jwt.sign({ userId: isUser.hmacKey }, process.env.JWT_SECRET as string, { expiresIn: '7d' });
			const session = new Session({
				token,
				user: isUser?._id
			});
			await session.save();
			res.status(200).json({ message: 'Sign up completed', code: 'SIGNUP_SUCCESSFUL', error: false, token });
		}
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} catch (error: any) {
		LogError(__dirname, 'POST', req.originalUrl, error);
		res.status(500).json({ message: error.message, code: 'SIGN_UP_FAILED', error: true });
	}
};
