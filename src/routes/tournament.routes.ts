import { Router } from "express";
import {
	getTournaments,
	getTournamentLiveMatch,
	getTournamentById,
	getTournamentMatches,
	recordMatchScore,
	joinTournament,
	leaveTournament,
	createTournament,
	updateTournament,
	getDoublesPairs,
	saveDoublesPairs,
	generateScoreQr,
	generateIndependentScoreQr,
	getActiveScoreQr,
	validateScoreQr,
	validateScoreQrConfirmContext,
	confirmScoreQr,
	updateScoreQrScores,
	cancelActiveScoreQr,
	streamScoreQrEvents,
} from '../controllers/tournament/controller';
import { requireOrganiserOrAbove, requirePlayerOrAbove } from '../middlewares/rbac';
import { createAuthedRouter } from './authedRouter';

const router = Router();
const authed = createAuthedRouter(router);

authed.get('/', requirePlayerOrAbove, getTournaments);
authed.get('/live-match', requirePlayerOrAbove, getTournamentLiveMatch);
authed.get('/:id', requirePlayerOrAbove, getTournamentById);
authed.get('/:id/doubles-pairs', requirePlayerOrAbove, getDoublesPairs);
authed.get('/:id/matches', requirePlayerOrAbove, getTournamentMatches);
authed.patch('/:id/matches/:matchId/score', requirePlayerOrAbove, recordMatchScore);

authed.post('/:id/matches/:matchId/score/qr', requirePlayerOrAbove, generateScoreQr);
authed.post('/score-qr/independent', requirePlayerOrAbove, generateIndependentScoreQr);
authed.get('/score-qr/active', requirePlayerOrAbove, getActiveScoreQr);
authed.delete('/score-qr/active', requirePlayerOrAbove, cancelActiveScoreQr);
authed.post('/score-qr/confirm-context', requirePlayerOrAbove, validateScoreQrConfirmContext);
authed.patch('/score-qr/:requestId/scores', requirePlayerOrAbove, updateScoreQrScores);
authed.get('/score-qr/:token/events', requirePlayerOrAbove, streamScoreQrEvents);
router.get('/score-qr/:token', validateScoreQr);
authed.post('/score-qr/confirm', requirePlayerOrAbove, confirmScoreQr);

authed.post('/:id/join', requirePlayerOrAbove, joinTournament);
authed.post('/:id/leave', requirePlayerOrAbove, leaveTournament);
authed.post('/', requireOrganiserOrAbove, createTournament);
authed.patch('/:id', requireOrganiserOrAbove, updateTournament);
authed.put('/:id/doubles-pairs', requirePlayerOrAbove, saveDoublesPairs);

export default router;
