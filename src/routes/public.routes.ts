/* eslint-disable @typescript-eslint/no-explicit-any */
import express from 'express';
import {
	filterClubs,
	getTournamentsForParticipation,
	publicClubs,
	getGames,
	userScore,
	userParticipatedTournaments,
	publicDropdownClubs,
	tournamentScore,
	getTournamentByIdWithParticipants
} from '../controllers/public.controller';
const router = express.Router();

router.get('/clubs', publicClubs as any);
router.get('/dropdown-clubs', publicDropdownClubs as any);
router.get('/filter-clubs', filterClubs as any);

router.post('/tournaments', getTournamentsForParticipation as any);
router.post('/schedule-by-tournament-id', getGames as any);

router.post('/user-score', userScore as any);
router.post('/user-participated-tournaments', userParticipatedTournaments as any);
router.post('/tournament-score', tournamentScore as any);

router.get('/participate/tournament', getTournamentByIdWithParticipants as any);

export default router;
