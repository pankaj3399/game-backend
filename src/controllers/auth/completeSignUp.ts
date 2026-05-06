import { logger } from '../../lib/logger';
import type { Request, Response } from 'express';
import { LogError } from '../../lib/logger';
import User, { type UserDocument } from '../../models/User';
import UserAuth from '../../models/UserAuth';
import { verifyPendingSignupToken } from './pendingToken';
import { DEFAULT_ELO } from '../../lib/config';
import { isSignupComplete } from './utils';
import { completeSignupSchema } from '../../validation/auth.schemas';
import { createAuthToken, setAuthCookie } from '../../lib/jwtAuth';
import { isApplePlaceholderEmail } from '../../lib/passport';
import mongoose from 'mongoose';

function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
}

async function reactivateUserIfDeleted(user: UserDocument, session: mongoose.ClientSession): Promise<UserDocument> {
	if (!user.deletedAt) return user;

	const reactivatedUser = await User.findByIdAndUpdate(
		user._id,
		{ deletedAt: null, status: 'active' },
		{ returnDocument: 'after', session }
	)
		.setOptions({ includeDeleted: true })
		.exec();

	if (!reactivatedUser) {
		throw new Error('Failed to reactivate deleted user');
	}

	logger.info('Reactivated user', { userId: reactivatedUser._id });

	return reactivatedUser;
}

export async function completeSignUp(req: Request, res: Response) {
	const parseResult = completeSignupSchema.safeParse(req.body);
	if (!parseResult.success) {
		return res.status(400).json({
			message: parseResult.error.message || 'Validation failed',
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

	const session = await mongoose.startSession();

	try {
		let finalUser: UserDocument | null = null;

		await session.withTransaction(async () => {
			const payload = verifyPendingSignupToken(data.pendingToken);

			let user: UserDocument | null = null;

			if (payload.appleId) {
				const userAuth = await UserAuth.findOne({ appleId: payload.appleId }).session(session);
				if (!userAuth) throw new Error('NO_USER_APPLE');
				user = await User.findById(userAuth.user).setOptions({ includeDeleted: true }).session(session);
			} else if (payload.googleId) {
				const userAuth = await UserAuth.findOne({ googleId: payload.googleId }).session(session);
				if (!userAuth) throw new Error('NO_USER_GOOGLE');
				user = await User.findById(userAuth.user).setOptions({ includeDeleted: true }).session(session);
			} else {
				user = await User.findOne({ email: normalizeEmail(payload.pendingEmail) })
					.setOptions({ includeDeleted: true })
					.session(session);
			}

			if (!user) throw new Error('NO_USER');

			const wasDeleted = Boolean(user.deletedAt);

			// Idempotent path
			if (isSignupComplete(user)) {
				if (wasDeleted) {
					user = await reactivateUserIfDeleted(user, session);
				}
				finalUser = user;
				return;
			}

			let emailToSet: string | undefined;
			const requiresEmailInput = payload.requiresEmailInput || isApplePlaceholderEmail(payload.pendingEmail);

			if (payload.appleId || payload.googleId) {
				if (requiresEmailInput) {
					if (!data.email) throw new Error('EMAIL_REQUIRED');
					emailToSet = normalizeEmail(data.email);
				} else {
					emailToSet = payload.pendingEmail ? normalizeEmail(payload.pendingEmail) : undefined;
				}
			}

			if (emailToSet) {
				const existing = await User.findOne({ email: emailToSet, _id: { $ne: user._id } })
					.setOptions({ includeDeleted: true })
					.session(session);

				if (existing) throw new Error('EMAIL_EXISTS');
			}

			user = await User.findByIdAndUpdate(
				user._id,
				{
					...updatePayload,
					...(emailToSet !== undefined ? { email: emailToSet } : {}),
					...(wasDeleted ? { deletedAt: null, status: 'active' } : {})
				},
				{ returnDocument: 'after', session }
			)
				.setOptions({ includeDeleted: true })
				.exec();

			if (!user) throw new Error('UPDATE_FAILED');

			finalUser = user;
		});

		if (!finalUser) {
			return res.status(404).json({ message: 'No user found. Please login again.', error: true, code: 'NO_USER_FOUND' });
		}

		const token = await createAuthToken(finalUser);
		setAuthCookie(res, token);

		return res.status(200).json({
			message: 'Sign up completed',
			code: 'SIGNUP_SUCCESSFUL',
			error: false,
			token
		});
	} catch (error: any) {
		LogError(__dirname, 'POST', req.originalUrl, error);

		if (error.message === 'NO_USER' || error.message === 'NO_USER_APPLE' || error.message === 'NO_USER_GOOGLE') {
			return res.status(404).json({ message: 'No user found. Please login again.', error: true, code: 'NO_USER_FOUND' });
		}

		if (error.message === 'EMAIL_REQUIRED') {
			return res.status(400).json({ message: 'A valid email address is required to finish signup.', error: true, code: 'EMAIL_REQUIRED' });
		}

		if (error.message === 'EMAIL_EXISTS') {
			return res.status(409).json({ message: 'An account with this email address already exists.', error: true, code: 'EMAIL_ALREADY_EXISTS' });
		}

		const isTokenError = error instanceof Error && (
			error.name === 'JsonWebTokenError' ||
			error.name === 'TokenExpiredError' ||
			error.message?.includes('Invalid pending signup token')
		);

		if (isTokenError) {
			return res.status(400).json({ message: 'Invalid or expired signup token. Please login again.', error: true, code: 'INVALID_TOKEN' });
		}

		return res.status(500).json({ message: 'Sign up failed', code: 'SIGN_UP_FAILED', error: true });
	} finally {
		session.endSession();
	}
}
