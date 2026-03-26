import express from 'express';
import {
	searchClubs,
	listClubs,
	addClubStaff,
	setClubMainAdmin,
	updateClubStaffRole,
	removeClubStaff,
	createClub,
	getClubById,
	getClubPublic,
	getClubStaff,
	updateClub
} from '../controllers/club/controller';
import {
	getClubSponsors,
	createSponsor,
	updateSponsor,
	deleteSponsor
} from '../controllers/sponsor/controller';
import authenticate from '../middlewares/auth';
import { validateBody } from '../lib/validation';
import { createSponsorSchema, updateSponsorSchema } from '../validation/sponsor.schemas';

const router = express.Router();

// Search clubs - requires auth so users can add to favorites
router.get('/', authenticate, searchClubs);

// List all clubs (for All Clubs page)
router.get('/list', authenticate, listClubs);

// Public club details (for club detail page)
router.get('/public/:clubId',authenticate, getClubPublic);

// Create club - any authenticated user can create a club
router.post(
	'/',
	authenticate,
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
	addClubStaff
);

// Set club main admin - only current main admin or super admin
router.patch(
	'/:clubId/staff/main-admin',
	authenticate,
	setClubMainAdmin
);

// Update admin/organiser role - user must be admin/organiser of club
router.patch(
	'/:clubId/staff/:staffId',
	authenticate,
	updateClubStaffRole
);

// Remove admin/organiser from club staff
router.delete(
	'/:clubId/staff/:staffId',
	authenticate,
	removeClubStaff
);

// Update club - user must be admin of club
router.patch(
	'/:clubId',
	authenticate,
	updateClub
);

// Sponsors - user must be admin of club; premium required for create/activate
router.get('/:clubId/sponsors', authenticate, getClubSponsors);
router.post(
	'/:clubId/sponsors',
	authenticate,
	validateBody(createSponsorSchema),
	createSponsor
);
router.patch(
	'/:clubId/sponsors/:sponsorId',
	authenticate,
	validateBody(updateSponsorSchema),
	updateSponsor
);
router.delete('/:clubId/sponsors/:sponsorId', authenticate, deleteSponsor);

export default router;
