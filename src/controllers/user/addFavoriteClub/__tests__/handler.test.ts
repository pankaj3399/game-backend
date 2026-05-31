/**
 * Unit tests for addFavoriteClub handler.
 *
 * These tests cover the duplicate-detection branch (modifiedCount === 0)
 * using mocked queries — the only reliable way to test this in the
 * MongoMemoryReplSet environment, which incorrectly reports modifiedCount=1
 * for no-op $addToSet operations even though DB state is always correct.
 */

import { addFavoriteClubFlow } from '../handler';
import * as queries from '../queries';

jest.mock('../queries');

const mockFindClubById = queries.findClubById as jest.MockedFunction<typeof queries.findClubById>;
const mockAddFavoriteClubToUser = queries.addFavoriteClubToUser as jest.MockedFunction<typeof queries.addFavoriteClubToUser>;

const CLUB_ID = '64a000000000000000000001';
const USER_ID = '64a000000000000000000002';

// ─── stub types ─────────────────────────────────────────────────────────────
// Express only what the handler reads from the query result. Casting a partial
// stub to the full Mongoose document type raises TS2352 ("not sufficiently
// overlapping"), so we narrow to the exact selected projection instead.

/** findClubById: Club.findById(...).select('_id').lean() */
type ClubIdProjection = { _id: string };
const stubClub: ClubIdProjection = { _id: CLUB_ID };

function makeUpdateResult(matched: number, modified: number): Awaited<ReturnType<typeof queries.addFavoriteClubToUser>> {
	return {
		acknowledged: true,
		matchedCount: matched,
		modifiedCount: modified,
		upsertedCount: 0,
		upsertedId: null,
	};
}

beforeEach(() => {
	jest.resetAllMocks();
});

describe('addFavoriteClubFlow', () => {

	describe('happy path', () => {
		it('returns 200 and ok when club is successfully added to favorites', async () => {
			mockFindClubById.mockResolvedValue(stubClub as never);
			mockAddFavoriteClubToUser.mockResolvedValue(makeUpdateResult(1, 1));

			const result = await addFavoriteClubFlow(USER_ID, { club: CLUB_ID });

			expect(result.status).toBe(200);
			expect(mockAddFavoriteClubToUser).toHaveBeenCalledWith(USER_ID, CLUB_ID);
		});
	});

	describe('rejection paths', () => {
		it('returns 404 when the club does not exist', async () => {
			mockFindClubById.mockResolvedValue(null);

			const result = await addFavoriteClubFlow(USER_ID, { club: CLUB_ID });

			expect(result.status).toBe(404);
			expect(result.message).toMatch(/club not found/i);
			expect(mockAddFavoriteClubToUser).not.toHaveBeenCalled();
		});

		it('returns 404 when the user is not found (matchedCount === 0)', async () => {
			mockFindClubById.mockResolvedValue(stubClub as never);
			mockAddFavoriteClubToUser.mockResolvedValue(makeUpdateResult(0, 0));

			const result = await addFavoriteClubFlow(USER_ID, { club: CLUB_ID });

			expect(result.status).toBe(404);
			expect(result.message).toMatch(/user not found/i);
		});

		it('returns 400 when the club is already in favorites (modifiedCount === 0, matchedCount === 1)', async () => {
			// This is the branch that MongoMemoryReplSet cannot trigger reliably in tests.
			// Covered here via a mocked modifiedCount=0 response.
			mockFindClubById.mockResolvedValue(stubClub as never);
			mockAddFavoriteClubToUser.mockResolvedValue(makeUpdateResult(1, 0));

			const result = await addFavoriteClubFlow(USER_ID, { club: CLUB_ID });

			expect(result.status).toBe(400);
			expect(result.message).toMatch(/already in favorites/i);
		});

		it('returns 500 when the query throws an unexpected error', async () => {
			mockFindClubById.mockResolvedValue(stubClub as never);
			mockAddFavoriteClubToUser.mockRejectedValue(new Error('DB connection lost'));

			const result = await addFavoriteClubFlow(USER_ID, { club: CLUB_ID });

			expect(result.status).toBe(500);
		});
	});
});
