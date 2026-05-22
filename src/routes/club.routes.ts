import { Router } from 'express';
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
	updateClub,
	requestClubSubscriptionRenewal
} from '../controllers/club/controller';
import {
	getClubSponsors,
	createSponsor,
	updateSponsor,
	deleteSponsor
} from '../controllers/sponsor/controller';
import { validateBody } from '../lib/validation';
import { createSponsorSchema, updateSponsorSchema } from '../validation/sponsor.schemas';
import optionalAuthenticate from '../middlewares/optionalAuthenticate';
import { createAuthedRouter } from './authedRouter';

const router = Router();
const authed = createAuthedRouter(router);

// Search clubs - requires auth so users can add to favorites
authed.get('/', searchClubs);

// List all clubs (guests: all clubs only; signed-in: home/favorites/distance filters)
router.get('/list', optionalAuthenticate, listClubs);

// Public club details (for club detail page)
router.get('/public/:clubId', getClubPublic);

// Create club - any authenticated user can create a club
authed.post(
	'/',
	createClub
);

// Get club by ID (for editing) - user must be admin of club
authed.get('/:clubId', getClubById);

// Get club staff (admins and organisers) - user must be admin of club
authed.get('/:clubId/staff', getClubStaff);

// Add admin or organiser - user must be admin of club
authed.post(
	'/:clubId/staff',
	addClubStaff
);

// Set club main admin - only current main admin or super admin
authed.patch(
	'/:clubId/staff/main-admin',
	setClubMainAdmin
);

// Update admin/organiser role - user must be admin/organiser of club
authed.patch(
	'/:clubId/staff/:staffId',
	updateClubStaffRole
);

// Remove admin/organiser from club staff
authed.delete(
	'/:clubId/staff/:staffId',
	removeClubStaff
);

// Update club - user must be admin of club
authed.patch(
	'/:clubId',
	updateClub
);

// Request subscription renewal - user must be admin/organiser of club
authed.patch(
	'/:clubId/subscription/renewal-request',
	requestClubSubscriptionRenewal
);

// Sponsors - user must be admin of club; premium required for create/activate
authed.get('/:clubId/sponsors', getClubSponsors);
authed.post(
	'/:clubId/sponsors',
	validateBody(createSponsorSchema),
	createSponsor
);
authed.patch(
	'/:clubId/sponsors/:sponsorId',
	validateBody(updateSponsorSchema),
	updateSponsor
);
authed.delete('/:clubId/sponsors/:sponsorId', deleteSponsor);

export default router;
