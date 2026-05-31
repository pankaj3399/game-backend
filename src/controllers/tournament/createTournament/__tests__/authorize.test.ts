import { Types } from 'mongoose';
import { authorizeCreate } from '../authorize';
import * as relations from '../../../../shared/relations';

jest.mock('../../../../shared/relations');

const mockManage = relations.checkClubManagement as jest.MockedFunction<
	typeof relations.checkClubManagement
>;
const mockExists = relations.checkClubExists as jest.MockedFunction<typeof relations.checkClubExists>;
const mockSponsor = relations.checkSponsorBelongsToClub as jest.MockedFunction<
	typeof relations.checkSponsorBelongsToClub
>;

const CLUB_ID = '507f1f77bcf86cd799439011';
const session = { _id: new Types.ObjectId('507f1f77bcf86cd799439012'), role: 'club_admin' } as never;

const draftInput = {
	status: 'draft' as const,
	tournamentMode: 'unscheduled' as const,
	club: CLUB_ID,
	name: 'Cup',
};

beforeEach(() => {
	jest.clearAllMocks();
	mockManage.mockResolvedValue({ ok: true, status: 200, message: 'ok', data: {} } as never);
	mockExists.mockResolvedValue({ ok: true, status: 200, message: 'ok', data: {} } as never);
	mockSponsor.mockResolvedValue({ ok: true, status: 200, message: 'ok', data: {} } as never);
});

describe('authorizeCreate', () => {
	it('returns 400 when club missing', async () => {
		const result = await authorizeCreate(
			{ ...draftInput, club: undefined } as never,
			session,
		);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.status).toBe(400);
	});

	it('returns manage error when user cannot manage club', async () => {
		mockManage.mockResolvedValue({ ok: false, status: 403, message: 'Forbidden' } as never);
		const result = await authorizeCreate(draftInput, session);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.status).toBe(403);
	});

	it('returns authorized context when checks pass', async () => {
		const result = await authorizeCreate(draftInput, session);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data.context.clubId).toBe(CLUB_ID);
		}
	});
});
