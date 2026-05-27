import express from 'express';
import type { Express, RequestHandler } from 'express';
import type { Server } from 'http';
import mongoose from 'mongoose';
import { ROLES, type Role } from '../../../../constants/roles';
import type { AuthenticatedSession } from '../../../../shared/authContext';
import Club from '../../../../models/Club';
import Game from '../../../../models/Game';
import Sponsor from '../../../../models/Sponsor';
import Tournament from '../../../../models/Tournament';
import type { TournamentPopulated } from '../../../../types/api/tournament';
import { getTournamentById } from '../index';

jest.mock('../../../../models/Tournament', () => ({
	__esModule: true,
	default: {
		findById: jest.fn(),
	},
}));

jest.mock('../../../../models/Game', () => ({
	__esModule: true,
	default: {
		exists: jest.fn(),
	},
}));

jest.mock('../../../../models/Club', () => ({
	__esModule: true,
	default: {
		exists: jest.fn(),
	},
}));

jest.mock('../../../../models/Sponsor', () => ({
	__esModule: true,
	default: {
		find: jest.fn(),
	},
}));

type HttpResult = {
	status: number;
	body: unknown;
};

const mockTournamentFindById = jest.mocked(Tournament.findById);
const mockClubExists = jest.mocked(Club.exists);
const mockGameExists = jest.mocked(Game.exists);
const mockSponsorFind = jest.mocked(Sponsor.find);

function tournamentQuery(value: TournamentPopulated | null) {
	const query = {
		populate: jest.fn(),
		lean: jest.fn(),
		exec: jest.fn<Promise<TournamentPopulated | null>, []>().mockResolvedValue(value),
	};
	query.populate.mockReturnValue(query);
	query.lean.mockReturnValue(query);
	return query;
}

function sponsorFindQuery(value: unknown[]) {
	const query = {
		select: jest.fn(),
		lean: jest.fn(),
		exec: jest.fn<Promise<unknown[]>, []>().mockResolvedValue(value),
	};
	query.select.mockReturnValue(query);
	query.lean.mockReturnValue(query);
	return query;
}

function gameExistsQuery(value: unknown) {
	const query = {
		lean: jest.fn(),
		exec: jest.fn<Promise<unknown>, []>().mockResolvedValue(value),
	};
	query.lean.mockReturnValue(query);
	return query;
}

function makeSession(
	id: mongoose.Types.ObjectId,
	role: Role = ROLES.PLAYER,
	adminOf: mongoose.Types.ObjectId[] = []
): AuthenticatedSession {
	return {
		_id: id,
		role,
		adminOf,
		organizerOf: [],
	} as unknown as AuthenticatedSession;
}

function makeTournament(options: {
	id?: mongoose.Types.ObjectId;
	clubId?: mongoose.Types.ObjectId;
	createdBy?: mongoose.Types.ObjectId;
	participantId?: mongoose.Types.ObjectId;
	status?: 'draft' | 'active';
} = {}): TournamentPopulated {
	const clubId = options.clubId ?? new mongoose.Types.ObjectId();
	const participantId = options.participantId ?? new mongoose.Types.ObjectId();
	const createdBy = options.createdBy ?? new mongoose.Types.ObjectId();
	return {
		_id: options.id ?? new mongoose.Types.ObjectId(),
		name: 'City Open',
		logoUrl: null,
		club: {
			_id: clubId,
			name: 'Central Club',
			address: '1 Main Street',
			logoUrl: null,
			courts: [{ _id: new mongoose.Types.ObjectId(), name: 'Court 1' }],
		},
		sponsor: null,
		date: new Date('2025-04-01T12:00:00.000Z'),
		startTime: '18:00',
		endTime: '21:00',
		timezone: 'UTC',
		playMode: '1set',
		tournamentMode: 'singleDay',
		entryFee: 25,
		minMember: 2,
		maxMember: 8,
		totalRounds: 3,
		duration: 45,
		breakDuration: 10,
		foodInfo: '',
		descriptionInfo: '',
		status: options.status ?? 'active',
		participants: [
			{
				_id: participantId,
				name: 'Player One',
				alias: 'P1',
				profilePictureUrl: null,
			},
		],
		doublesPairs: {},
		createdBy: {
			equals: (value: unknown) => createdBy.equals(value as mongoose.Types.ObjectId),
		},
		createdAt: new Date('2025-03-01T00:00:00.000Z'),
		updatedAt: new Date('2025-03-02T00:00:00.000Z'),
		completedAt: null,
	} as unknown as TournamentPopulated;
}

function buildApp(session?: AuthenticatedSession): Express {
	const app = express();
	if (session) {
		const attachSession: RequestHandler = (req, _res, next) => {
			req.user = session as Express.User;
			next();
		};
		app.use(attachSession);
	}
	app.get('/tournaments/:id', getTournamentById);
	return app;
}

async function request(app: Express, path: string): Promise<HttpResult> {
	const server = await new Promise<Server>((resolve) => {
		const listeningServer = app.listen(0, () => resolve(listeningServer));
	});
	const address = server.address();
	if (!address || typeof address === 'string') {
		server.close();
		throw new Error('Test server did not bind to a TCP port');
	}

	try {
		const response = await fetch(`http://127.0.0.1:${address.port}${path}`);
		const text = await response.text();
		return {
			status: response.status,
			body: text ? JSON.parse(text) : null,
		};
	} finally {
		await new Promise<void>((resolve, reject) => {
			server.close((error) => {
				if (error) {
					reject(error);
					return;
				}
				resolve();
			});
		});
	}
}

describe('GET tournament by id integration', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockClubExists.mockResolvedValue(null);
		mockSponsorFind.mockReturnValue(sponsorFindQuery([]) as unknown as ReturnType<typeof Sponsor.find>);
		mockGameExists
			.mockReturnValueOnce(gameExistsQuery(null) as unknown as ReturnType<typeof Game.exists>)
			.mockReturnValueOnce(gameExistsQuery(null) as unknown as ReturnType<typeof Game.exists>);
	});

	it('returns 400 for invalid route ids without querying the database', async () => {
		const result = await request(buildApp(), '/tournaments/not-an-object-id');

		expect(result).toEqual({
			status: 400,
			body: { message: 'Invalid tournament ID', error: true },
		});
		expect(mockTournamentFindById).not.toHaveBeenCalled();
	});

	it('returns 404 when the tournament does not exist', async () => {
		const tournamentId = new mongoose.Types.ObjectId();
		mockTournamentFindById.mockReturnValue(tournamentQuery(null) as unknown as ReturnType<typeof Tournament.findById>);

		const result = await request(buildApp(), `/tournaments/${tournamentId.toString()}`);

		expect(result).toEqual({
			status: 404,
			body: { message: 'Tournament not found', error: true },
		});
		expect(mockSponsorFind).not.toHaveBeenCalled();
	});

	it('returns public tournament details for guests', async () => {
		const tournamentId = new mongoose.Types.ObjectId();
		const tournament = makeTournament({ id: tournamentId, status: 'active' });
		mockTournamentFindById.mockReturnValue(
			tournamentQuery(tournament) as unknown as ReturnType<typeof Tournament.findById>
		);
		mockSponsorFind.mockReturnValue(
			sponsorFindQuery([{ _id: 'sponsor-1', name: 'Local Sponsor', logoUrl: null, link: null }]) as unknown as ReturnType<typeof Sponsor.find>
		);

		const result = await request(buildApp(), `/tournaments/${tournamentId.toString()}`);

		expect(result.status).toBe(200);
		expect(result.body).toEqual({
			tournament: expect.objectContaining({
				id: tournamentId.toString(),
				name: 'City Open',
				club: expect.objectContaining({ name: 'Central Club' }),
				clubSponsors: [{ id: 'sponsor-1', name: 'Local Sponsor', logoUrl: null, link: null }],
				permissions: {
					canEdit: false,
					canJoin: true,
					canLeave: false,
					isParticipant: false,
				},
			}),
		});
		expect(mockSponsorFind).toHaveBeenCalledWith({
			scope: 'club',
			club: tournament.club?._id.toString(),
			status: 'active',
		});
	});

	it('blocks guests from draft tournament details', async () => {
		const tournamentId = new mongoose.Types.ObjectId();
		mockTournamentFindById.mockReturnValue(
			tournamentQuery(makeTournament({ id: tournamentId, status: 'draft' })) as unknown as ReturnType<typeof Tournament.findById>
		);

		const result = await request(buildApp(), `/tournaments/${tournamentId.toString()}`);

		expect(result).toEqual({
			status: 403,
			body: { message: 'You do not have permission to view this tournament', error: true },
		});
		expect(mockSponsorFind).not.toHaveBeenCalled();
	});

	it('returns draft details to club admins and marks edit permissions', async () => {
		const tournamentId = new mongoose.Types.ObjectId();
		const clubId = new mongoose.Types.ObjectId();
		const adminId = new mongoose.Types.ObjectId();
		const tournament = makeTournament({
			id: tournamentId,
			clubId,
			createdBy: new mongoose.Types.ObjectId(),
			status: 'draft',
		});
		mockTournamentFindById.mockReturnValue(
			tournamentQuery(tournament) as unknown as ReturnType<typeof Tournament.findById>
		);

		const result = await request(
			buildApp(makeSession(adminId, ROLES.CLUB_ADMIN, [clubId])),
			`/tournaments/${tournamentId.toString()}`
		);

		expect(result.status).toBe(200);
		expect(result.body).toEqual({
			tournament: expect.objectContaining({
				id: tournamentId.toString(),
				status: 'draft',
				permissions: {
					canEdit: false,
					canJoin: false,
					canLeave: false,
					isParticipant: false,
				},
			}),
		});
	});

	it('loads leave-check queries for participant sessions and marks leave permissions', async () => {
		const tournamentId = new mongoose.Types.ObjectId();
		const participantId = new mongoose.Types.ObjectId();
		mockTournamentFindById.mockReturnValue(
			tournamentQuery(makeTournament({ id: tournamentId, participantId })) as unknown as ReturnType<typeof Tournament.findById>
		);
		mockGameExists
			.mockReturnValueOnce(gameExistsQuery({ _id: new mongoose.Types.ObjectId() }) as unknown as ReturnType<typeof Game.exists>)
			.mockReturnValueOnce(gameExistsQuery(null) as unknown as ReturnType<typeof Game.exists>);

		const result = await request(
			buildApp(makeSession(participantId, ROLES.PLAYER)),
			`/tournaments/${tournamentId.toString()}`
		);

		expect(result.status).toBe(200);
		expect(result.body).toEqual({
			tournament: expect.objectContaining({
				permissions: {
					canEdit: false,
					canJoin: false,
					canLeave: true,
					isParticipant: true,
				},
			}),
		});
		expect(mockGameExists).toHaveBeenCalledTimes(2);
	});
});
