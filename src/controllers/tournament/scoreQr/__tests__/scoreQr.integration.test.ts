import { Router } from 'express';
import Game from '../../../../models/Game';
import ScoreValidationRequest from '../../../../models/ScoreValidationRequest';
import authenticate from '../../../../middlewares/auth';
import { requirePlayerOrAbove } from '../../../../middlewares/rbac';
import {
	createSession,
	createUser,
	seedActiveTournamentWithMatch,
	setupMemoryMongo,
} from '../../../../testUtils/db';
import { buildJsonApp, readSsePreview, requestJson } from '../../../../testUtils/integrationTestUtils';
import {
	cancelActiveScoreQr,
	confirmScoreQr,
	generateScoreQr,
	getActiveScoreQr,
	streamScoreQrEvents,
	updateScoreQrScores,
	validateScoreQr,
	validateScoreQrConfirmContext,
} from '../index';

setupMemoryMongo();

function buildApp() {
	const router = Router();
	router.post('/:id/matches/:matchId/score/qr', authenticate, requirePlayerOrAbove, generateScoreQr);
	router.get('/score-qr/active', authenticate, requirePlayerOrAbove, getActiveScoreQr);
	router.delete('/score-qr/active', authenticate, requirePlayerOrAbove, cancelActiveScoreQr);
	router.post('/score-qr/confirm-context', authenticate, requirePlayerOrAbove, validateScoreQrConfirmContext);
	router.patch('/score-qr/:requestId/scores', authenticate, requirePlayerOrAbove, updateScoreQrScores);
	router.get('/score-qr/:token/events', authenticate, requirePlayerOrAbove, streamScoreQrEvents);
	router.get('/score-qr/:token', validateScoreQr);
	router.post('/score-qr/confirm', authenticate, requirePlayerOrAbove, confirmScoreQr);
	return buildJsonApp('/tournaments', router);
}

async function generateTournamentQr(app: ReturnType<typeof buildApp>, input: {
	requesterSession: { authorization: string };
	tournamentId: string;
	matchId: string;
	playerOneScores: Array<number | 'wo' | null>;
	playerTwoScores: Array<number | 'wo' | null>;
}) {
	const generated = await requestJson(
		app,
		`/tournaments/${input.tournamentId}/matches/${input.matchId}/score/qr`,
		{
			method: 'POST',
			headers: { authorization: input.requesterSession.authorization },
			body: {
				playerOneScores: input.playerOneScores,
				playerTwoScores: input.playerTwoScores,
			},
		},
	);
	expect(generated.status).toBe(200);
	return generated.body as { qr: { token: string; requestId: string } };
}

describe('score QR integration', () => {
	const app = buildApp();
	const originalJwtSecret = process.env.JWT_SECRET;
	const originalWebAppUrl = process.env.WEB_APP_URL;

	beforeEach(() => {
		process.env.JWT_SECRET ??= 'test-jwt-secret';
		process.env.WEB_APP_URL = 'https://app.example.test';
	});

	afterEach(() => {
		if (originalJwtSecret === undefined) {
			delete process.env.JWT_SECRET;
		} else {
			process.env.JWT_SECRET = originalJwtSecret;
		}
		if (originalWebAppUrl === undefined) {
			delete process.env.WEB_APP_URL;
		} else {
			process.env.WEB_APP_URL = originalWebAppUrl;
		}
	});

	it('generates, validates, and confirms a tournament score QR with persisted request and match state', async () => {
		const requester = await createUser({ name: 'Requester', alias: 'REQ' });
		const opponent = await createUser({ name: 'Opponent', alias: 'OPP' });
		const requesterSession = await createSession(requester);
		const opponentSession = await createSession(opponent);
		const { tournament, game } = await seedActiveTournamentWithMatch({
			createdBy: requester._id,
			participants: [requester._id, opponent._id],
			playMode: 'TieBreak10',
			status: 'active',
		});

		const { qr } = await generateTournamentQr(app, {
			requesterSession,
			tournamentId: tournament._id.toString(),
			matchId: game._id.toString(),
			playerOneScores: [10],
			playerTwoScores: [6],
		});
		const { token, requestId } = qr;

		const pending = await ScoreValidationRequest.findById(requestId).lean().orFail();
		expect(pending).toMatchObject({
			requestByUser: requester._id,
			opponentUser: opponent._id,
			tournament: tournament._id,
			match: game._id,
			playerOneScores: [10],
			playerTwoScores: [6],
			playMode: 'TieBreak10',
			matchType: 'singles',
			status: 'pending',
		});

		const validated = await requestJson(app, `/tournaments/score-qr/${token}`);
		expect(validated.status).toBe(200);
		expect(validated.body).toMatchObject({
			message: 'QR token is valid',
			valid: true,
			reason: 'ok',
			request: {
				id: requestId,
				tournamentId: tournament._id.toString(),
				matchId: game._id.toString(),
				requestByUserId: requester._id.toString(),
				opponentUserId: opponent._id.toString(),
				playerOneScores: [10],
				playerTwoScores: [6],
				playMode: 'TieBreak10',
				matchType: 'singles',
			},
		});

		const context = await requestJson(app, '/tournaments/score-qr/confirm-context', {
			method: 'POST',
			headers: { authorization: opponentSession.authorization },
			body: { token },
		});
		expect(context.status).toBe(200);
		expect(context.body).toMatchObject({
			message: 'QR token is valid for this confirmer',
			valid: true,
			request: {
				id: requestId,
				matchId: game._id.toString(),
			},
		});

		const confirmed = await requestJson(app, '/tournaments/score-qr/confirm', {
			method: 'POST',
			headers: { authorization: opponentSession.authorization },
			body: { token },
		});
		expect(confirmed.status).toBe(200);
		expect(confirmed.body).toMatchObject({
			message: 'Score confirmed and match completed',
			match: {
				id: game._id.toString(),
				tournamentId: tournament._id.toString(),
				status: 'completed',
			},
			request: {
				id: requestId,
				consumedAt: expect.any(String),
			},
		});

		const consumed = await ScoreValidationRequest.findById(requestId).lean().orFail();
		expect(consumed.status).toBe('consumed');
		expect(consumed.consumedBy?.toString()).toBe(opponent._id.toString());
		expect(consumed.consumedAt).toBeInstanceOf(Date);

		const scoredGame = await Game.findById(game._id).lean().orFail();
		expect(scoredGame.status).toBe('finished');
		expect(scoredGame.score).toEqual({
			playerOneScores: [10],
			playerTwoScores: [6],
		});
		expect(scoredGame.endTime).toBeInstanceOf(Date);
	});

	it('blocks non-opponents from confirming without consuming the QR request or changing the match', async () => {
		const requester = await createUser();
		const opponent = await createUser();
		const outsider = await createUser();
		const requesterSession = await createSession(requester);
		const outsiderSession = await createSession(outsider);
		const { tournament, game } = await seedActiveTournamentWithMatch({
			createdBy: requester._id,
			participants: [requester._id, opponent._id],
		});

		const { qr } = await generateTournamentQr(app, {
			requesterSession,
			tournamentId: tournament._id.toString(),
			matchId: game._id.toString(),
			playerOneScores: [10],
			playerTwoScores: [8],
		});
		const { token, requestId } = qr;

		await expect(
			requestJson(app, '/tournaments/score-qr/confirm', {
				method: 'POST',
				headers: { authorization: outsiderSession.authorization },
				body: { token },
			}),
		).resolves.toEqual({
			status: 403,
			body: {
				message: 'You are not allowed to confirm this score.',
				error: true,
			},
		});

		const stillPending = await ScoreValidationRequest.findById(requestId).lean().orFail();
		expect(stillPending.status).toBe('pending');
		expect(stillPending.consumedAt).toBeNull();
		expect(stillPending.consumedBy).toBeNull();
		const unchangedGame = await Game.findById(game._id).lean().orFail();
		expect(unchangedGame.status).toBe('active');
		expect(unchangedGame.score).toEqual({
			playerOneScores: [],
			playerTwoScores: [],
		});
	});

	it('returns the active pending session and updates scores without changing the match', async () => {
		const requester = await createUser();
		const opponent = await createUser();
		const requesterSession = await createSession(requester);
		const { tournament, game } = await seedActiveTournamentWithMatch({
			createdBy: requester._id,
			participants: [requester._id, opponent._id],
			playMode: 'TieBreak10',
		});

		const { qr } = await generateTournamentQr(app, {
			requesterSession,
			tournamentId: tournament._id.toString(),
			matchId: game._id.toString(),
			playerOneScores: [10],
			playerTwoScores: [6],
		});

		const active = await requestJson(
			app,
			`/tournaments/score-qr/active?flow=tournament&tournamentId=${tournament._id.toString()}&matchId=${game._id.toString()}`,
			{ headers: { authorization: requesterSession.authorization } },
		);
		expect(active.status).toBe(200);
		expect(active.body).toMatchObject({
			message: 'Active score QR session fetched',
			session: expect.objectContaining({
				requestId: qr.requestId,
				token: qr.token,
				flow: 'tournament',
				playerOneScores: [10],
				playerTwoScores: [6],
			}),
		});

		const updated = await requestJson(app, `/tournaments/score-qr/${qr.requestId}/scores`, {
			method: 'PATCH',
			headers: { authorization: requesterSession.authorization },
			body: {
				playerOneScores: [10],
				playerTwoScores: [8],
			},
		});
		expect(updated.status).toBe(200);
		expect(updated.body).toMatchObject({
			message: 'QR session scores updated',
			requestId: qr.requestId,
			playerOneScores: [10],
			playerTwoScores: [8],
		});

		const persistedRequest = await ScoreValidationRequest.findById(qr.requestId).lean().orFail();
		expect(persistedRequest.playerOneScores).toEqual([10]);
		expect(persistedRequest.playerTwoScores).toEqual([8]);
		expect(persistedRequest.status).toBe('pending');

		const unchangedGame = await Game.findById(game._id).lean().orFail();
		expect(unchangedGame.status).toBe('active');
		expect(unchangedGame.score).toEqual({
			playerOneScores: [],
			playerTwoScores: [],
		});

		const validated = await requestJson(app, `/tournaments/score-qr/${qr.token}`);
		expect(validated.body).toMatchObject({
			valid: true,
			request: {
				playerOneScores: [10],
				playerTwoScores: [8],
			},
		});
	});

	it('cancels the active pending session without finishing the match', async () => {
		const requester = await createUser();
		const opponent = await createUser();
		const requesterSession = await createSession(requester);
		const { tournament, game } = await seedActiveTournamentWithMatch({
			createdBy: requester._id,
			participants: [requester._id, opponent._id],
		});

		const { qr } = await generateTournamentQr(app, {
			requesterSession,
			tournamentId: tournament._id.toString(),
			matchId: game._id.toString(),
			playerOneScores: [10],
			playerTwoScores: [6],
		});

		const cancelled = await requestJson(app, '/tournaments/score-qr/active', {
			method: 'DELETE',
			headers: { authorization: requesterSession.authorization },
		});
		expect(cancelled.status).toBe(200);
		expect(cancelled.body).toEqual({ success: true });

		const request = await ScoreValidationRequest.findById(qr.requestId).lean().orFail();
		expect(request.status).toBe('cancelled');

		const active = await requestJson(app, '/tournaments/score-qr/active', {
			headers: { authorization: requesterSession.authorization },
		});
		expect(active.body).toMatchObject({
			message: 'No active score QR session',
			session: null,
		});

		const unchangedGame = await Game.findById(game._id).lean().orFail();
		expect(unchangedGame.status).toBe('active');
	});

	it('opens an SSE stream for the opponent and emits a connected event', async () => {
		const requester = await createUser();
		const opponent = await createUser();
		const requesterSession = await createSession(requester);
		const opponentSession = await createSession(opponent);
		const { tournament, game } = await seedActiveTournamentWithMatch({
			createdBy: requester._id,
			participants: [requester._id, opponent._id],
		});

		const { qr } = await generateTournamentQr(app, {
			requesterSession,
			tournamentId: tournament._id.toString(),
			matchId: game._id.toString(),
			playerOneScores: [10],
			playerTwoScores: [6],
		});

		const stream = await readSsePreview(app, `/tournaments/score-qr/${qr.token}/events`, {
			headers: { authorization: opponentSession.authorization },
		});

		expect(stream.status).toBe(200);
		expect(stream.contentType).toContain('text/event-stream');
		expect(stream.body).toContain('event: connected');
		expect(stream.body).toContain(qr.requestId);
	});
});
