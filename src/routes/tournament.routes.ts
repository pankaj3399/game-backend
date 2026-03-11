import express from 'express';
import {
	getTournaments,
	getTournamentById,
	createTournament,
	updateTournament,
	publishTournament
} from '../controllers/tournament/controller';
import authenticate from '../middlewares/auth';
import { requireOrganiserOrAbove } from '../middlewares/rbac';

const router = express.Router();

router.get('/', authenticate, requireOrganiserOrAbove, getTournaments);
router.get('/:id', authenticate, requireOrganiserOrAbove, getTournamentById);
router.post('/', authenticate, requireOrganiserOrAbove, createTournament);
router.patch('/:id', authenticate, requireOrganiserOrAbove, updateTournament);
router.post('/:id/publish', authenticate, requireOrganiserOrAbove, publishTournament);

export default router;
