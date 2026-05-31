import Session from '../../models/Session';
import User from '../../models/User';
import authRouter from '../auth.routes';
import { createPendingSignupToken } from '../../controllers/auth/pendingToken';
import {
	createSession,
	createUser,
	createUserAuth,
	setupMemoryMongo,
} from '../../testUtils/db';
import { buildJsonApp, requestJson } from '../../testUtils/integrationTestUtils';

setupMemoryMongo();

describe('auth routes integration', () => {
	const app = buildJsonApp('/auth', authRouter);

	it('completes pending signup, persists profile fields, and creates a session', async () => {
		process.env.JWT_SECRET ??= 'test-jwt-secret';
		const pendingUser = await createUser({
			email: 'pending@example.com',
		});
		pendingUser.name = null;
		pendingUser.alias = null;
		await pendingUser.save();
		await createUserAuth(pendingUser._id);
		const pendingToken = createPendingSignupToken({
			pendingEmail: ' pending@example.com ',
		});

		const result = await requestJson(app, '/auth/complete-signup', {
			method: 'POST',
			body: {
				pendingToken,
				alias: ' Ace ',
				name: ' Ada Player ',
				dateOfBirth: '1990-03-04',
				gender: 'female',
			},
		});

		expect(result.status).toBe(200);
		expect(result.body).toMatchObject({
			message: 'Sign up completed',
			code: 'SIGNUP_SUCCESSFUL',
			error: false,
			token: expect.any(String),
		});

		const persisted = await User.findById(pendingUser._id).select('+deletedAt').lean().orFail();
		expect(persisted).toMatchObject({
			email: 'pending@example.com',
			alias: 'Ace',
			name: 'Ada Player',
			gender: 'female',
			status: 'active',
		});
		expect(persisted.dateOfBirth).toBeInstanceOf(Date);
		await expect(Session.countDocuments({ user: pendingUser._id })).resolves.toBe(1);
	});

	it('rejects duplicate signup email without changing the pending user or creating a session', async () => {
		process.env.JWT_SECRET ??= 'test-jwt-secret';
		await createUser({ email: 'taken@example.com' });
		const pendingUser = await createUser({
			email: 'apple-placeholder@example.invalid',
		});
		pendingUser.name = null;
		pendingUser.alias = null;
		await pendingUser.save();
		await createUserAuth(pendingUser._id, { appleId: 'apple-duplicate-email' });
		const pendingToken = createPendingSignupToken({
			pendingEmail: 'privaterelay@appleid.com',
			appleId: 'apple-duplicate-email',
			requiresEmailInput: true,
		});
		const beforeSessions = await Session.countDocuments();

		await expect(
			requestJson(app, '/auth/complete-signup', {
				method: 'POST',
				body: {
					pendingToken,
					alias: 'Taken',
					name: 'Taken Email',
					email: 'TAKEN@example.com',
				},
			})
		).resolves.toEqual({
			status: 409,
			body: {
				message: 'An account with this email address already exists.',
				error: true,
				code: 'EMAIL_ALREADY_EXISTS',
			},
		});

		const unchanged = await User.findById(pendingUser._id).lean().orFail();
		expect(unchanged.email).toBe('apple-placeholder@example.invalid');
		expect(unchanged.alias).toBeNull();
		expect(unchanged.name).toBeNull();
		await expect(Session.countDocuments()).resolves.toBe(beforeSessions);
	});

	it('returns the authenticated user from /me and revokes the same session on logout', async () => {
		const user = await createUser({
			email: 'me@example.com',
			name: 'Session User',
			alias: 'SU',
		});
		const { authorization, session } = await createSession(user);

		await expect(
			requestJson(app, '/auth/me', {
				headers: { authorization },
			})
		).resolves.toEqual({
			status: 200,
			body: {
				user: {
					id: user._id.toString(),
					email: 'me@example.com',
					name: 'Session User',
					alias: 'SU',
					profilePictureUrl: null,
					dateOfBirth: null,
					gender: null,
					role: 'player',
				},
			},
		});

		await expect(
			requestJson(app, '/auth/logout', {
				method: 'POST',
				headers: { authorization },
			})
		).resolves.toEqual({
			status: 200,
			body: { message: 'Logged out successfully' },
		});

		await expect(Session.exists({ _id: session._id })).resolves.toBeNull();
		await expect(
			requestJson(app, '/auth/me', {
				headers: { authorization },
			})
		).resolves.toEqual({
			status: 401,
			body: { message: 'Session expired, login again' },
		});
	});
});
