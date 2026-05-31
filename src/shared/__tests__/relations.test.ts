import { Types } from 'mongoose';
import Club from '../../models/Club';
import Court from '../../models/Court';
import * as permissions from '../../lib/permissions';
import {
	checkClubExists,
	checkClubManagement,
	checkCourtsBelongToClub,
	checkSponsorBelongsToClub,
} from '../relations';

jest.mock('../../models/Club');
jest.mock('../../models/Court');
jest.mock('../../lib/permissions');

const mockUserCanManageClub = permissions.userCanManageClub as jest.MockedFunction<
	typeof permissions.userCanManageClub
>;
const mockSponsorBelongsToClub = permissions.sponsorBelongsToClub as jest.MockedFunction<
	typeof permissions.sponsorBelongsToClub
>;

const CLUB_ID = '507f1f77bcf86cd799439011';
const COURT_ID = '507f1f77bcf86cd799439012';

function findByIdChain<T>(value: T) {
	return {
		select: () => ({
			lean: () => ({ exec: () => Promise.resolve(value) }),
		}),
	};
}

function findChain<T>(value: T) {
	return {
		select: () => ({
			lean: () => ({ exec: () => Promise.resolve(value) }),
		}),
	};
}

beforeEach(() => {
	jest.clearAllMocks();
});

describe('checkClubManagement', () => {
	it('returns 403 when user cannot manage club', async () => {
		mockUserCanManageClub.mockResolvedValue(false);
		const result = await checkClubManagement({} as never, CLUB_ID);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.status).toBe(403);
		}
	});

	it('returns ok when user can manage', async () => {
		mockUserCanManageClub.mockResolvedValue(true);
		const result = await checkClubManagement({} as never, CLUB_ID);
		expect(result.ok).toBe(true);
	});
});

describe('checkClubExists', () => {
	it('returns 404 when club missing', async () => {
		(Club.findById as jest.Mock).mockReturnValue(findByIdChain(null));
		const result = await checkClubExists(CLUB_ID);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.status).toBe(404);
	});

	it('returns ok when club exists', async () => {
		(Club.findById as jest.Mock).mockReturnValue(findByIdChain({ _id: CLUB_ID }));
		const result = await checkClubExists(CLUB_ID);
		expect(result.ok).toBe(true);
	});
});

describe('checkSponsorBelongsToClub', () => {
	it('returns 400 when sponsor invalid for club', async () => {
		mockSponsorBelongsToClub.mockResolvedValue(false);
		const result = await checkSponsorBelongsToClub('507f1f77bcf86cd799439099', CLUB_ID);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.status).toBe(400);
	});
});

describe('checkCourtsBelongToClub', () => {
	it('returns 400 when not all courts belong to club', async () => {
		(Court.find as jest.Mock).mockReturnValue(findChain([{ _id: new Types.ObjectId(COURT_ID) }]));
		const result = await checkCourtsBelongToClub(CLUB_ID, [COURT_ID, '507f1f77bcf86cd799439099']);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.status).toBe(400);
	});

	it('deduplicates court ids before lookup', async () => {
		(Court.find as jest.Mock).mockReturnValue(findChain([{ _id: new Types.ObjectId(COURT_ID) }]));
		const result = await checkCourtsBelongToClub(CLUB_ID, [COURT_ID, COURT_ID]);
		expect(result.ok).toBe(true);
		expect(Court.find).toHaveBeenCalledWith(
			expect.objectContaining({ _id: { $in: [COURT_ID] } }),
		);
	});
});
