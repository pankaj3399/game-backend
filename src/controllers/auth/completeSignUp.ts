import type { Request, Response } from 'express';
import { LogError } from '../../lib/logger';
import User, { type UserDocument } from '../../models/User';
import UserAuth from '../../models/UserAuth';
import { verifyPendingSignupToken } from './pendingToken';
import { DEFAULT_ELO } from '../../constants/elo';
import { isSignupComplete } from './utils';
import { completeSignupSchema } from '../../validation/auth.schemas';
import { createAuthToken, setAuthCookie } from '../../lib/jwtAuth';

/**
 * Completes first-time signup. Requires a valid pendingToken from the OAuth redirect.
 * Updates the User with profile info and creates JWT + Session (auth cookie).
 * Idempotent: safe to call multiple times. If the user is already complete, creates a new
 * JWT session and logs them in before returning success.
 */
export async function completeSignUp(req: Request, res: Response) {
	const parseResult = completeSignupSchema.safeParse(req.body);
	if (!parseResult.success) {
		const message = parseResult.error.message || 'Validation failed';
		return res.status(400).json({
			message,
			error: true,
			code: 'VALIDATION_ERROR'
		});
	}
	const data = parseResult.data;

	const updatePayload = {
		alias: data.alias,
		name: data.name,
		dateOfBirth: data.dateOfBirth ?? null,
		gender: data.gender ?? null,
		elo: DEFAULT_ELO
	};

	try {
		const payload = verifyPendingSignupToken(data.pendingToken);

		let user: UserDocument | null = null;
		if (payload.appleId) {
			const userAuth = await UserAuth.findOne({ appleId: payload.appleId }).exec();
			if (!userAuth)
				return res
					.status(404)
					.json({ message: 'No user found. Please login with Apple.', error: true, code: 'NO_USER_FOUND' });

			user = (await User.findById(userAuth.user).exec()) ?? null;
		} else if (payload.googleId) {
			const userAuth = await UserAuth.findOne({ googleId: payload.googleId }).exec();
			if (!userAuth)
				return res
					.status(404)
					.json({ message: 'No user found. Please login with Google.', error: true, code: 'NO_USER_FOUND' });

			user = (await User.findById(userAuth.user).exec()) ?? null;
		} else {
			user = (await User.findOne({ email: payload.pendingEmail }).exec()) ?? null;
		}

		if (!user) {
			return res.status(404).json({ message: 'No user found. Please login again.', error: true, code: 'NO_USER_FOUND' });
		}

		// Idempotent: if user was already complete (e.g. double submit), create JWT session and return
		if (isSignupComplete(user)) {
			try {
				const token = await createAuthToken(user);
				setAuthCookie(res, token);
				return res.status(200).json({ message: 'Sign up completed', code: 'SIGNUP_SUCCESSFUL', error: false });
			} catch (err) {
				LogError(__dirname, 'POST', req.originalUrl, err);
				return res.status(500).json({ message: 'Session creation failed', error: true, code: 'SIGN_UP_FAILED' });
			}
		}

		// First-time complete: update user, create JWT session
		user = (await User.findByIdAndUpdate(user._id, {
			...updatePayload,
			...(payload.appleId || payload.googleId ? { email: payload.pendingEmail } : {})
		}, { returnDocument: 'after' }).exec()) ?? null;

		if (!user) {
			return res.status(404).json({ message: 'No user found. Please login again.', error: true, code: 'NO_USER_FOUND' });
		}

		try {
			const token = await createAuthToken(user);
			setAuthCookie(res, token);
			return res.status(200).json({ message: 'Sign up completed', code: 'SIGNUP_SUCCESSFUL', error: false });
		} catch (err) {
			LogError(__dirname, 'POST', req.originalUrl, err);
			return res.status(500).json({ message: 'Session creation failed', error: true, code: 'SIGN_UP_FAILED' });
		}
	} catch (error: unknown) {
		LogError(__dirname, 'POST', req.originalUrl, error);
		const isTokenError = error instanceof Error && (
			error.name === 'JsonWebTokenError' ||
			error.name === 'TokenExpiredError' ||
			error.message?.includes('Invalid pending signup token')
		);
		if (isTokenError) {
			return res.status(400).json({ message: 'Invalid or expired signup token. Please login again.', error: true, code: 'INVALID_TOKEN' });
		}
		res.status(500).json({ message: 'Sign up failed', code: 'SIGN_UP_FAILED', error: true });
	}
}
