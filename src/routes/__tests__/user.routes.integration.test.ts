import { Types } from 'mongoose';
import { hashSessionToken } from '../../lib/jwtAuth';
import User from '../../models/User';
import Session from '../../models/Session';
import userRouter from '../user.routes';
import {
	createClub,
	createSession,
	createUser,
	setupMemoryMongo,
} from '../../testUtils/db';
import { buildJsonApp, requestJson } from '../../testUtils/integrationTestUtils';

setupMemoryMongo();

describe('user routes integration', () => {
	const app = buildJsonApp('/users', userRouter);

	// ─── updateProfile ─────────────────────────────────────────────────────────

	describe('PATCH /users/update-profile', () => {
		it('updates name and alias and persists changes', async () => {
			const user = await createUser({ name: 'Old Name', alias: 'OldAlias' });
			const { authorization } = await createSession(user);

			const res = await requestJson(app, '/users/update-profile', {
				method: 'PATCH',
				headers: { authorization },
				body: { name: ' New Name ', alias: ' NewAlias ' },
			});

			expect(res.status).toBe(200);

			const persisted = await User.findById(user._id).lean().orFail();
			expect(persisted.name).toBe('New Name');
			expect(persisted.alias).toBe('NewAlias');
		});

		it('returns 401 for unauthenticated requests', async () => {
			const res = await requestJson(app, '/users/update-profile', {
				method: 'PATCH',
				body: { name: 'Ghost' },
			});
			expect(res.status).toBe(401);
		});
	});

	// ─── addFavoriteClub ───────────────────────────────────────────────────────

	describe('POST /users/favorite-clubs', () => {
		it('adds a club to favorites and persists to DB', async () => {
			const user = await createUser();
			const { authorization } = await createSession(user);
			const club = await createClub();

			const res = await requestJson(app, '/users/favorite-clubs', {
				method: 'POST',
				headers: { authorization },
				body: { club: club._id.toString() },
			});

			expect(res.status).toBe(200);

			const updated = await User.findById(user._id).lean().orFail();
			expect(updated.favoriteClubs?.map((id) => id.toString())).toContain(club._id.toString());
		});

		it('returns 401 for unauthenticated requests', async () => {
			const club = await createClub();
			const res = await requestJson(app, '/users/favorite-clubs', {
				method: 'POST',
				body: { club: club._id.toString() },
			});
			expect(res.status).toBe(401);
		});

		it('returns 404 when the club does not exist', async () => {
			const user = await createUser();
			const { authorization } = await createSession(user);

			const res = await requestJson(app, '/users/favorite-clubs', {
				method: 'POST',
				headers: { authorization },
				body: { club: new Types.ObjectId().toString() },
			});

			expect(res.status).toBe(404);
		});
	});

	// ─── removeFavoriteClub ────────────────────────────────────────────────────

	describe('DELETE /users/favorite-clubs/:clubId', () => {
		it('removes a club from favorites and persists to DB', async () => {
			const user = await createUser();
			const club = await createClub();
			user.favoriteClubs = [club._id];
			await user.save();

			const { authorization } = await createSession(user);

			const res = await requestJson(app, `/users/favorite-clubs/${club._id.toString()}`, {
				method: 'DELETE',
				headers: { authorization },
			});

			expect(res.status).toBe(200);

			const updated = await User.findById(user._id).lean().orFail();
			expect(updated.favoriteClubs?.map((id) => id.toString())).not.toContain(
				club._id.toString(),
			);
		});

		it('returns 401 for unauthenticated requests', async () => {
			const res = await requestJson(
				app,
				`/users/favorite-clubs/${new Types.ObjectId().toString()}`,
				{ method: 'DELETE' },
			);
			expect(res.status).toBe(401);
		});
	});

	// ─── setHomeClub ───────────────────────────────────────────────────────────

	describe('PATCH /users/home-club', () => {
		it('sets home club when the club is in favorites', async () => {
			const user = await createUser();
			const club = await createClub();
			user.favoriteClubs = [club._id];
			await user.save();

			const { authorization } = await createSession(user);

			const res = await requestJson(app, '/users/home-club', {
				method: 'PATCH',
				headers: { authorization },
				body: { club: club._id.toString() },
			});

			expect(res.status).toBe(200);

			const updated = await User.findById(user._id).lean().orFail();
			expect(updated.homeClub?.toString()).toBe(club._id.toString());
		});

		it('returns 400 when the club is not in favorites', async () => {
			const user = await createUser();
			const club = await createClub(); // not in favorites
			const { authorization } = await createSession(user);

			const res = await requestJson(app, '/users/home-club', {
				method: 'PATCH',
				headers: { authorization },
				body: { club: club._id.toString() },
			});

			expect(res.status).toBe(400);
		});

		it('returns 401 for unauthenticated requests', async () => {
			const res = await requestJson(app, '/users/home-club', {
				method: 'PATCH',
				body: { club: new Types.ObjectId().toString() },
			});
			expect(res.status).toBe(401);
		});
	});

	// ─── deleteAccount ─────────────────────────────────────────────────────────

	describe('DELETE /users/delete-account', () => {
		it('soft-deletes the user and revokes all sessions', async () => {
			const user = await createUser();
			const { authorization, session } = await createSession(user);
			const session2 = await Session.create({
				token: hashSessionToken(`second-session-${user._id.toString()}`),
				user: user._id,
				expireAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
			});

			const res = await requestJson(app, '/users/delete-account', {
				method: 'DELETE',
				headers: { authorization },
			});

			expect(res.status).toBe(200);

			// Sessions must be purged
			await expect(Session.exists({ _id: session._id })).resolves.toBeNull();
			await expect(Session.exists({ _id: session2._id })).resolves.toBeNull();

			// User must be soft-deleted (deletedAt set). Bypass the pre-find hook with setOptions.
			const deleted = await User.findById(user._id)
				.setOptions({ includeDeleted: true })
				.select('+deletedAt')
				.lean()
				.orFail();
			expect(deleted.deletedAt).not.toBeNull();
		});

		it('returns 401 for unauthenticated requests', async () => {
			const res = await requestJson(app, '/users/delete-account', { method: 'DELETE' });
			expect(res.status).toBe(401);
		});
	});
});
