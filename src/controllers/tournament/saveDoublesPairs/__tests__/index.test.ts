/**
 * Unit tests for saveDoublesPairs route handler (logic lives in index.ts).
 */

import { Types } from 'mongoose';
import type { Response } from 'express';
import Tournament from '../../../../models/Tournament';
import { saveDoublesPairs } from '../index';
import { authorizeGetById } from '../../shared/authorizeGetById';
import { fetchTournamentById } from '../../shared/fetchTournamentById';
import { userCanManageClub } from '../../../../lib/permissions';
import { ROLES } from '../../../../constants/roles';
import type { AuthenticatedRequest } from '../../../../shared/authContext';

jest.mock('../../../../models/Tournament');
jest.mock('../../shared/authorizeGetById');
jest.mock('../../shared/fetchTournamentById');
jest.mock('../../../../lib/permissions');

const TOURNAMENT_ID = '507f1f77bcf86cd799439011';
const USER_ID = new Types.ObjectId('507f1f77bcf86cd799439012');
const PARTNER_ID = new Types.ObjectId('507f1f77bcf86cd799439013');

function makeRes(): Response {
	return {
		status: jest.fn().mockReturnThis(),
		json: jest.fn().mockReturnThis(),
	} as unknown as Response;
}

function makeReq(body: Record<string, unknown> = {}): AuthenticatedRequest {
	return {
		params: { id: TOURNAMENT_ID },
		body,
		user: {
			_id: USER_ID,
			role: ROLES.PLAYER,
		},
	} as unknown as AuthenticatedRequest;
}

beforeEach(() => {
	jest.clearAllMocks();
});

describe('saveDoublesPairs', () => {
	it('returns 404 when tournament is not found', async () => {
		(fetchTournamentById as jest.Mock).mockResolvedValue(null);
		const res = makeRes();

		await saveDoublesPairs(makeReq({ doublesPairs: {} }), res);

		expect(res.status).toHaveBeenCalledWith(404);
	});

	it('returns 403 when authorizeGetById denies access', async () => {
		(fetchTournamentById as jest.Mock).mockResolvedValue({ _id: TOURNAMENT_ID });
		(authorizeGetById as jest.Mock).mockResolvedValue({
			status: 403,
			message: 'Forbidden',
		});

		const res = makeRes();
		await saveDoublesPairs(makeReq({ doublesPairs: {} }), res);

		expect(res.status).toHaveBeenCalledWith(403);
	});

	it('returns 200 with sanitized pairs for participant self-pairing', async () => {
		(fetchTournamentById as jest.Mock).mockResolvedValue({
			_id: new Types.ObjectId(TOURNAMENT_ID),
			createdBy: new Types.ObjectId(),
		});
		(authorizeGetById as jest.Mock).mockResolvedValue({
			status: 200,
			data: { context: { clubIdStr: '507f1f77bcf86cd799439099' } },
		});
		(userCanManageClub as jest.Mock).mockResolvedValue(false);

		const snapshot = {
			participants: [{ _id: USER_ID }, { _id: PARTNER_ID }],
			doublesPairs: {},
			__v: 0,
		};
		const updated = {
			participants: snapshot.participants,
			doublesPairs: {
				[USER_ID.toString()]: PARTNER_ID.toString(),
				[PARTNER_ID.toString()]: USER_ID.toString(),
			},
		};

		(Tournament.findById as jest.Mock).mockReturnValue({
			select: () => ({
				lean: () => ({
					exec: () => Promise.resolve(snapshot),
				}),
			}),
		});
		(Tournament.findOneAndUpdate as jest.Mock).mockReturnValue({
			select: () => ({
				lean: () => ({
					exec: () => Promise.resolve(updated),
				}),
			}),
		});

		const res = makeRes();
		await saveDoublesPairs(
			makeReq({
				doublesPairs: { [USER_ID.toString()]: PARTNER_ID.toString() },
			}),
			res,
		);

		expect(res.status).toHaveBeenCalledWith(200);
		expect(res.json).toHaveBeenCalledWith(
			expect.objectContaining({
				message: 'Doubles pairs saved',
				doublesPairs: expect.objectContaining({
					[USER_ID.toString()]: PARTNER_ID.toString(),
				}),
			}),
		);
	});
});
