import { ROLES } from '../../constants/roles';
import tournamentRouter from '../tournament.routes';
import { attachTestUser, optionallyAttachTestUser } from '../../testUtils/routeMockAuth';
import { buildJsonApp, request } from '../../testUtils/routeIntegrationTestUtils';

jest.mock('../../middlewares/auth', () => ({
	__esModule: true,
	default: require('../../testUtils/routeMockAuth').attachTestUser,
}));

jest.mock('../../middlewares/optionalAuthenticate', () => ({
	__esModule: true,
	default: require('../../testUtils/routeMockAuth').optionallyAttachTestUser,
}));

jest.mock('../../controllers/tournament/controller', () => {
	const { controllerMarker } = require('../../testUtils/routeIntegrationTestUtils');
	return {
		cancelActiveScoreQr: controllerMarker('cancelActiveScoreQr'),
		confirmScoreQr: controllerMarker('confirmScoreQr'),
		createTournament: controllerMarker('createTournament'),
		generateIndependentScoreQr: controllerMarker('generateIndependentScoreQr'),
		generateScoreQr: controllerMarker('generateScoreQr'),
		getActiveScoreQr: controllerMarker('getActiveScoreQr'),
		getDoublesPairs: controllerMarker('getDoublesPairs'),
		getTournamentById: controllerMarker('getTournamentById'),
		getTournamentLiveMatch: controllerMarker('getTournamentLiveMatch'),
		getTournamentMatches: controllerMarker('getTournamentMatches'),
		getTournaments: controllerMarker('getTournaments'),
		joinTournament: controllerMarker('joinTournament'),
		leaveTournament: controllerMarker('leaveTournament'),
		recordMatchScore: controllerMarker('recordMatchScore'),
		saveDoublesPairs: controllerMarker('saveDoublesPairs'),
		streamScoreQrEvents: controllerMarker('streamScoreQrEvents'),
		updateScoreQrScores: controllerMarker('updateScoreQrScores'),
		updateTournament: controllerMarker('updateTournament'),
		validateScoreQr: controllerMarker('validateScoreQr'),
		validateScoreQrConfirmContext: controllerMarker('validateScoreQrConfirmContext'),
	};
});

describe('tournament routes integration', () => {
	const app = buildJsonApp('/tournaments', tournamentRouter);

	it('keeps tournament list public with optional auth', async () => {
		await expect(request(app, '/tournaments')).resolves.toEqual({
			status: 200,
			body: {
				handler: 'getTournaments',
				params: {},
				body: {},
				role: null,
			},
		});
	});

	it('routes public tournament matches before tournament detail', async () => {
		await expect(request(app, '/tournaments/tournament-1/matches')).resolves.toEqual({
			status: 200,
			body: {
				handler: 'getTournamentMatches',
				params: { id: 'tournament-1' },
				body: {},
				role: null,
			},
		});
	});

	it('routes public score QR validation before tournament detail', async () => {
		await expect(request(app, '/tournaments/score-qr/token-1')).resolves.toEqual({
			status: 200,
			body: {
				handler: 'validateScoreQr',
				params: { token: 'token-1' },
				body: {},
				role: null,
			},
		});
	});

	it('blocks unauthenticated protected tournament mutations', async () => {
		await expect(
			request(app, '/tournaments/tournament-1/join', { method: 'POST' })
		).resolves.toEqual({
			status: 401,
			body: { message: 'Authorization required' },
		});
	});

	it('allows players to join tournaments', async () => {
		await expect(
			request(app, '/tournaments/tournament-1/join', {
				method: 'POST',
				headers: { 'x-test-role': ROLES.PLAYER },
			})
		).resolves.toEqual({
			status: 200,
			body: {
				handler: 'joinTournament',
				params: { id: 'tournament-1' },
				body: {},
				role: ROLES.PLAYER,
			},
		});
	});

	it('blocks players from organiser tournament creation', async () => {
		await expect(
			request(app, '/tournaments', {
				method: 'POST',
				headers: { 'x-test-role': ROLES.PLAYER },
				body: JSON.stringify({ name: 'New Tournament' }),
			})
		).resolves.toEqual({
			status: 403,
			body: {
				message: 'Insufficient permissions',
				code: 'FORBIDDEN',
			},
		});
	});

	it('allows organisers to create tournaments', async () => {
		await expect(
			request(app, '/tournaments', {
				method: 'POST',
				headers: { 'x-test-role': ROLES.ORGANISER },
				body: JSON.stringify({ name: 'New Tournament' }),
			})
		).resolves.toEqual({
			status: 200,
			body: {
				handler: 'createTournament',
				params: {},
				body: { name: 'New Tournament' },
				role: ROLES.ORGANISER,
			},
		});
	});

	it('routes protected score QR actions before public token validation', async () => {
		await expect(
			request(app, '/tournaments/score-qr/request-1/scores', {
				method: 'PATCH',
				headers: { 'x-test-role': ROLES.PLAYER },
				body: JSON.stringify({ scores: [6, 4] }),
			})
		).resolves.toEqual({
			status: 200,
			body: {
				handler: 'updateScoreQrScores',
				params: { requestId: 'request-1' },
				body: { scores: [6, 4] },
				role: ROLES.PLAYER,
			},
		});
	});
});
