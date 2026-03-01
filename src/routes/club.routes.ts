import express from 'express';
import {
	searchClubs,
	createClub,
	getClubById,
	getClubStaff,
	addClubStaff,
	updateClub
} from '../controllers/club/controller';
import authenticate from '../middlewares/auth';
import { requireClubAdminOrAbove } from '../middlewares/rbac';
import { validateBody } from '../lib/validation';
import { createClubSchema, updateClubSchema, addClubStaffSchema } from '../validation/club.schemas';

const router = express.Router();

// Search clubs - requires auth so users can add to favorites
router.get('/', authenticate, searchClubs);

// Create club - requires club_admin or super_admin
router.post(
	'/',
	authenticate,
	requireClubAdminOrAbove,
	validateBody(createClubSchema),
	createClub
);

// Get club by ID (for editing) - user must be admin of club
router.get('/:clubId', authenticate, getClubById);

// Get club staff (admins and organisers) - user must be admin of club
router.get('/:clubId/staff', authenticate, getClubStaff);

// Add admin or organiser - user must be admin of club
router.post(
	'/:clubId/staff',
	authenticate,
	validateBody(addClubStaffSchema),
	addClubStaff
);

// Update club - user must be admin of club
router.patch(
	'/:clubId',
	authenticate,
	validateBody(updateClubSchema),
	updateClub
);

export default router;
