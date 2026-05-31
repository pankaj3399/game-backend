import { Types } from 'mongoose';
import { authorizeJoin } from '../authorize';

const USER_ID = new Types.ObjectId('507f1f77bcf86cd799439011');
const OTHER_ID = new Types.ObjectId('507f1f77bcf86cd799439012');
const CLUB_ID = new Types.ObjectId('507f1f77bcf86cd799439013');

const session = { _id: USER_ID } as never;

function tournament(overrides: Record<string, unknown> = {}) {
	return {
		_id: new Types.ObjectId('507f1f77bcf86cd799439014'),
		status: 'active',
		club: { _id: CLUB_ID },
		participants: [] as Types.ObjectId[],
		maxMember: 8,
		...overrides,
	};
}

describe('authorizeJoin', () => {
	it('rejects non-active tournaments', async () => {
		const result = await authorizeJoin(tournament({ status: 'draft' }), session);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.message).toMatch(/active tournaments/i);
	});

	it('rejects when user already joined', async () => {
		const result = await authorizeJoin(
			tournament({ participants: [USER_ID] }),
			session,
		);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.message).toMatch(/already joined/i);
	});

	it('rejects when tournament is full', async () => {
		const full = Array.from({ length: 8 }, (_, i) => new Types.ObjectId());
		const result = await authorizeJoin(tournament({ participants: full, maxMember: 8 }), session);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.message).toMatch(/full/i);
	});

	it('authorizes when spots remain', async () => {
		const result = await authorizeJoin(
			tournament({ participants: [OTHER_ID], maxMember: 8 }),
			session,
		);
		expect(result.ok).toBe(true);
	});
});
