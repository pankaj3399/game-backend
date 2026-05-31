import { Types } from 'mongoose';
import type { Response } from 'express';
import { updateTournament } from '../index';
import { fetchTournamentForUpdate } from '../queries';
import { authorizeUpdate } from '../authorize';
import { updateTournamentFlow } from '../handler';
import { resolveTournamentTimezoneFromClub, TournamentTimezoneResolutionError } from '../../shared/resolveTournamentTimezone';
import { AppError } from '../../../../shared/errors';
import { ROLES } from '../../../../constants/roles';
import type { AuthenticatedRequest } from '../../../../shared/authContext';

jest.mock('../queries');
jest.mock('../authorize');
jest.mock('../handler');
jest.mock('../../shared/resolveTournamentTimezone');
jest.mock('../../../../lib/logger', () => ({
	logger: { error: jest.fn(), info: jest.fn() },
}));

const TOURNAMENT_ID = '507f1f77bcf86cd799439011';
const CLUB_ID = '507f1f77bcf86cd799439012';
const USER_ID = new Types.ObjectId('507f1f77bcf86cd799439013');

const baseTournament = {
	status: 'draft' as const,
	club: new Types.ObjectId(CLUB_ID),
	createdBy: USER_ID,
	name: 'Open Cup',
	date: new Date('2026-06-01'),
	startTime: '09:00',
	endTime: '18:00',
	timezone: 'Europe/London',
	playMode: '3set' as const,
	tournamentMode: 'unscheduled' as const,
	entryFee: 0,
	minMember: 4,
	maxMember: 32,
	totalRounds: 3,
	duration: 60,
	breakDuration: 0,
	foodInfo: '',
	descriptionInfo: '',
	sponsor: null,
};

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
		user: { _id: USER_ID, role: ROLES.ORGANISER },
	} as unknown as AuthenticatedRequest;
}

beforeEach(() => {
	jest.clearAllMocks();
	(fetchTournamentForUpdate as jest.Mock).mockResolvedValue({
		status: 200,
		data: baseTournament,
	});
	(authorizeUpdate as jest.Mock).mockResolvedValue({
		status: 200,
		data: { clubId: CLUB_ID, clubChanged: false },
	});
	(resolveTournamentTimezoneFromClub as jest.Mock).mockResolvedValue('Europe/London');
	(updateTournamentFlow as jest.Mock).mockResolvedValue({
		ok: true,
		tournament: { id: TOURNAMENT_ID, name: 'Open Cup' },
	});
});

describe('updateTournament HTTP handler', () => {
	it('returns 400 for invalid tournament id', async () => {
		const res = makeRes();
		await updateTournament({ ...makeReq(), params: { id: 'bad' } } as never, res);
		expect(res.status).toHaveBeenCalledWith(400);
	});

	it('returns 404 when tournament not found', async () => {
		(fetchTournamentForUpdate as jest.Mock).mockResolvedValue(null);
		const res = makeRes();
		await updateTournament(makeReq({ name: 'Renamed' }), res);
		expect(res.status).toHaveBeenCalledWith(404);
	});

	it('returns auth error from fetchTournamentForUpdate', async () => {
		(fetchTournamentForUpdate as jest.Mock).mockResolvedValue({
			status: 403,
			message: 'Forbidden',
		});
		const res = makeRes();
		await updateTournament(makeReq({ name: 'Renamed' }), res);
		expect(res.status).toHaveBeenCalledWith(403);
	});

	it('returns 400 for invalid body', async () => {
		const res = makeRes();
		await updateTournament(makeReq({ minMember: -1 }), res);
		expect(res.status).toHaveBeenCalledWith(400);
	});

	it('returns authorize failure', async () => {
		(authorizeUpdate as jest.Mock).mockResolvedValue({ status: 403, message: 'No permission' });
		const res = makeRes();
		await updateTournament(makeReq({ name: 'Renamed' }), res);
		expect(res.status).toHaveBeenCalledWith(403);
	});

	it('returns 200 on successful draft update', async () => {
		const res = makeRes();
		await updateTournament(makeReq({ name: 'Summer Cup' }), res);
		expect(res.status).toHaveBeenCalledWith(200);
		expect(res.json).toHaveBeenCalledWith(
			expect.objectContaining({ message: 'Tournament updated' }),
		);
	});

	it('resolves timezone when date changes', async () => {
		const res = makeRes();
		await updateTournament(makeReq({ date: '2026-07-01' }), res);
		expect(resolveTournamentTimezoneFromClub).toHaveBeenCalledWith(CLUB_ID);
	});

	it('returns 400 when timezone resolution fails', async () => {
		(resolveTournamentTimezoneFromClub as jest.Mock).mockRejectedValue(
			new TournamentTimezoneResolutionError('Club timezone missing'),
		);
		const res = makeRes();
		await updateTournament(makeReq({ date: '2026-07-01' }), res);
		expect(res.status).toHaveBeenCalledWith(400);
	});

	it('returns 400 when schedule activation enrollment fails', async () => {
		(fetchTournamentForUpdate as jest.Mock).mockResolvedValue({
			status: 200,
			data: {
				...baseTournament,
				tournamentMode: 'unscheduled',
				participants: [new Types.ObjectId(), new Types.ObjectId()],
				minMember: 8,
			},
		});
		const res = makeRes();
		await updateTournament(
			makeReq({
				status: 'active',
				tournamentMode: 'singleDay',
				date: '2026-06-01',
				startTime: '09:00',
				endTime: '18:00',
				totalRounds: 3,
				minMember: 8,
			}),
			res,
		);
		expect(res.status).toHaveBeenCalledWith(400);
		expect(res.json).toHaveBeenCalledWith(
			expect.objectContaining({
				message: expect.stringContaining('At least 8 registered participants'),
			}),
		);
	});

	it('returns 404 when update flow yields no document', async () => {
		(updateTournamentFlow as jest.Mock).mockResolvedValue({ ok: false });
		const res = makeRes();
		await updateTournament(makeReq({ name: 'Ghost' }), res);
		expect(res.status).toHaveBeenCalledWith(404);
	});

	it('maps duplicate key error to 409', async () => {
		(updateTournamentFlow as jest.Mock).mockRejectedValue({
			code: 11000,
			keyPattern: { club: 1, name: 1 },
		});
		const res = makeRes();
		await updateTournament(makeReq({ name: 'Duplicate' }), res);
		expect(res.status).toHaveBeenCalledWith(409);
	});

	it('maps AppError with details to response body', async () => {
		(updateTournamentFlow as jest.Mock).mockRejectedValue(
			new AppError('publish validation failed', 400, { message: 'bad publish' }),
		);
		const res = makeRes();
		await updateTournament(makeReq({ status: 'active', totalRounds: 3 }), res);
		expect(res.status).toHaveBeenCalledWith(400);
		expect(res.json).toHaveBeenCalledWith({ message: 'bad publish' });
	});

	it('maps no-courts error to 400', async () => {
		(updateTournamentFlow as jest.Mock).mockRejectedValue(
			new Error('Selected club has no courts'),
		);
		const res = makeRes();
		await updateTournament(makeReq({ status: 'active' }), res);
		expect(res.status).toHaveBeenCalledWith(400);
	});
});
