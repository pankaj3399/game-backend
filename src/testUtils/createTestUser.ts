import type { Role } from '../constants/roles';

export const DEFAULT_TEST_USER_ID = '64b000000000000000000001';

export type CreateTestUserOverrides = Partial<Express.User> & {
	role?: Role | string;
};

export function createTestUser(overrides: CreateTestUserOverrides = {}): Express.User {
	const { role, _id, ...rest } = overrides;
	const id =
		_id ??
		({
			toString: () => DEFAULT_TEST_USER_ID,
		} as Express.User['_id']);

	return {
		_id: id,
		role: role ?? 'player',
		adminOf: [],
		organizerOf: [],
		favoriteClubs: [],
		homeClub: null,
		email: 'player@example.com',
		status: 'active',
		gender: null,
		elo: { rating: 1500, tau: 0.5, rd: 200, vol: 0.06 },
		createdAt: new Date('2024-01-01T00:00:00.000Z'),
		updatedAt: new Date('2024-01-01T00:00:00.000Z'),
		...rest,
	} as unknown as Express.User;
}
