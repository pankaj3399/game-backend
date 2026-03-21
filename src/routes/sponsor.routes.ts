import express from 'express';
import {
	createSponsor,
	deleteSponsor,
	getAllSponsors,
	getClubSponsors,
	updateSponsor
} from '../controllers/sponsor/controller';
import authenticate from '../middlewares/auth';
import { validateBody } from '../lib/validation';
import { createSponsorSchema, updateSponsorSchema } from '../validation/sponsor.schemas';

const router = express.Router();

// List all unique sponsors across all clubs (public)
router.get('/', getAllSponsors);

// Club sponsor management endpoints (authenticated club admin/organiser; enforced in controllers)
router.get('/clubs/:clubId', authenticate, getClubSponsors);
router.post('/clubs/:clubId', authenticate, validateBody(createSponsorSchema), createSponsor);
router.patch('/clubs/:clubId/:sponsorId', authenticate, validateBody(updateSponsorSchema), updateSponsor);
router.delete('/clubs/:clubId/:sponsorId', authenticate, deleteSponsor);

export default router;
