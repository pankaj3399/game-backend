import { Router } from 'express';
import {
	getTournaments,
	getTournamentById,
	getTournamentMatches,
	joinTournament,
	leaveTournament,
	createTournament,
	updateTournament
} from '../controllers/tournament/controller';
import { requireOrganiserOrAbove, requirePlayerOrAbove } from '../middlewares/rbac';
import { createAuthedRouter } from './authedRouter';

const router = Router();
const authed = createAuthedRouter(router);

authed.get('/', requirePlayerOrAbove, getTournaments);
authed.get('/:id', requirePlayerOrAbove, getTournamentById);
authed.get('/:id/matches', requirePlayerOrAbove, getTournamentMatches);
authed.post('/:id/join', requirePlayerOrAbove, joinTournament);
authed.post('/:id/leave', requirePlayerOrAbove, leaveTournament);
authed.post('/', requireOrganiserOrAbove, createTournament);
authed.patch('/:id', requireOrganiserOrAbove, updateTournament);

export default router;
