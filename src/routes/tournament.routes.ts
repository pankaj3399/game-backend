import express from 'express';
import {
	getTournaments,
	getTournamentById,
	joinTournament,
	createTournament,
	updateTournament,
	publishTournament
} from '../controllers/tournament/controller';
import authenticate from '../middlewares/auth';
import { requireOrganiserOrAbove, requirePlayerOrAbove } from '../middlewares/rbac';

const router = express.Router();

router.get('/', authenticate, requirePlayerOrAbove, getTournaments);
router.get('/:id', authenticate, requirePlayerOrAbove, getTournamentById);
router.post('/:id/join', authenticate, requirePlayerOrAbove, joinTournament);
router.post('/', authenticate, requireOrganiserOrAbove, createTournament);
router.patch('/:id', authenticate, requireOrganiserOrAbove, updateTournament);
router.post('/:id/publish', authenticate, requireOrganiserOrAbove, publishTournament);

export default router;
