/* eslint-disable @typescript-eslint/no-explicit-any */
import express from 'express';
import {
	activateFavoriteClub,
	addClub,
	addFavoriteClub,
	addOrUpdateScoreByOrganizer,
	addTournament,
	archiveClub,
	clubDropdown,
	courtsByClubId,
	deleteFavoriteClub,
	deleteParticipation,
	deleteUserProfile,
	editClub,
	editTournament,
	editTournamentPauseAndPlayTime,
	getClubs,
	getFavoriteClubs,
	getScheduledGames,
	getTournamentActiveRoundByID,
	getTournaments,
	getTournamentsForDropdown,
	getTournamentsParticipants,
	getUserParticipatedTournaments,
	getUserProfile,
	hasClub,
	isAdmin,
	leaveParticipation,
	participate,
	reScheduleTournament,
	scheduleTournament,
	updateParticipantsOrder,
	updateUserProfile,
	validateScore
} from '../controllers/user.controller';

const router = express.Router();

router.get('/profile', getUserProfile as any);
router.put('/update-profile', updateUserProfile as any);
router.delete('/delete-profile', deleteUserProfile as any);

// Club
router.post('/club', addClub as any);
router.put('/club/:id', editClub as any);
router.get('/clubs', getClubs as any);
router.patch('/archive-club/:id', archiveClub as any);
// Dropdown
router.get('/club-dropdown', clubDropdown as any);

// Favorite Club
router.post('/favorite-club', addFavoriteClub as any);
router.get('/favorite-clubs', getFavoriteClubs as any);
router.patch('/active-favorite-club/:id', activateFavoriteClub as any);
router.delete('/favorite-club/:id', deleteFavoriteClub as any);

// Courts
router.post('/courts-by-club-id', courtsByClubId as any);

// User Tournaments
router.post('/tournament', addTournament as any);
router.put('/tournament/:id', editTournament as any);
router.get('/tournaments', getTournaments as any);
router.get('/tournament/:id/participants', getTournamentsParticipants as any); // Edited by Ata
router.patch('/tournament/:id/participants/order', updateParticipantsOrder as any); // Edited by Ata
router.patch('/tournament/:id/timing', editTournamentPauseAndPlayTime as any);
router.get('/tournaments/dropdown', getTournamentsForDropdown as any);

// Update score by admin
router.post('/organizer/tournaments/score/update', addOrUpdateScoreByOrganizer as any);

// Participate
router.post('/participate', participate as any); // Edited by Ata
router.post('/participate/leave', leaveParticipation as any); // Edited by Ata
router.post('/participate/:id', deleteParticipation as any); // Completed BY Sahal

router.post('/schedule', scheduleTournament as any); // Edited by Ata
router.post('/re-schedule', reScheduleTournament as any); // Edited By Sahal

// Games
router.get('/tournament/games/:id', getScheduledGames as any); // Edited by Ata

// Score
router.get('/get-active-round', getTournamentActiveRoundByID as any);
router.get('/get-user-participated-tournaments', getUserParticipatedTournaments as any);
router.post('/validate-score', validateScore as any);

// Flags API's
router.get('/has-club', hasClub as any);
router.post('/is-admin', isAdmin as any);

export default router;
