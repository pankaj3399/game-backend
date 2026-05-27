import { ROLES } from '../../constants/roles';
import clubRouter from '../club.routes';
import { buildJsonApp, request } from '../../testUtils/routeIntegrationTestUtils';

jest.mock('../../middlewares/auth', () => ({
	__esModule: true,
	default: require('../../testUtils/routeMockAuth').attachTestUser,
}));

jest.mock('../../middlewares/optionalAuthenticate', () => ({
	__esModule: true,
	default: require('../../testUtils/routeMockAuth').optionallyAttachTestUser,
}));

jest.mock('../../controllers/club/controller', () => {
	const { controllerMarker } = require('../../testUtils/routeIntegrationTestUtils');
	return {
		addClubStaff: controllerMarker('addClubStaff'),
		createClub: controllerMarker('createClub'),
		getClubById: controllerMarker('getClubById'),
		getClubPublic: controllerMarker('getClubPublic'),
		getClubStaff: controllerMarker('getClubStaff'),
		listClubs: controllerMarker('listClubs'),
		removeClubStaff: controllerMarker('removeClubStaff'),
		requestClubSubscriptionRenewal: controllerMarker('requestClubSubscriptionRenewal'),
		searchClubs: controllerMarker('searchClubs'),
		setClubMainAdmin: controllerMarker('setClubMainAdmin'),
		updateClub: controllerMarker('updateClub'),
		updateClubStaffRole: controllerMarker('updateClubStaffRole'),
	};
});

jest.mock('../../controllers/sponsor/controller', () => {
	const { controllerMarker } = require('../../testUtils/routeIntegrationTestUtils');
	return {
		createSponsor: controllerMarker('createSponsor'),
		deleteSponsor: controllerMarker('deleteSponsor'),
		getClubSponsors: controllerMarker('getClubSponsors'),
		updateSponsor: controllerMarker('updateSponsor'),
	};
});

describe('club routes integration', () => {
	const app = buildJsonApp('/clubs', clubRouter);

	it('keeps public club details open', async () => {
		await expect(request(app, '/clubs/public/club-1')).resolves.toEqual({
			status: 200,
			body: {
				handler: 'getClubPublic',
				params: { clubId: 'club-1' },
				body: {},
				role: null,
			},
		});
	});

	it('allows optional auth on club list', async () => {
		await expect(
			request(app, '/clubs/list', { headers: { 'x-test-role': ROLES.PLAYER } })
		).resolves.toEqual({
			status: 200,
			body: {
				handler: 'listClubs',
				params: {},
				body: {},
				role: ROLES.PLAYER,
			},
		});
	});

	it('requires auth for club search', async () => {
		await expect(request(app, '/clubs')).resolves.toEqual({
			status: 401,
			body: { message: 'Authorization required' },
		});
	});

	it('routes authenticated club staff reads', async () => {
		await expect(
			request(app, '/clubs/club-1/staff', { headers: { 'x-test-role': ROLES.CLUB_ADMIN } })
		).resolves.toEqual({
			status: 200,
			body: {
				handler: 'getClubStaff',
				params: { clubId: 'club-1' },
				body: {},
				role: ROLES.CLUB_ADMIN,
			},
		});
	});

	it('validates nested club sponsor creation before reaching the controller', async () => {
		await expect(
			request(app, '/clubs/club-1/sponsors', {
				method: 'POST',
				headers: {
					'x-test-role': ROLES.CLUB_ADMIN,
					'content-type': 'application/json',
				},
				body: JSON.stringify({ link: 'https://example.com' }),
			})
		).resolves.toMatchObject({
			status: 400,
			body: {
				error: true,
				code: 'VALIDATION_ERROR',
			},
		});
	});

	it('routes valid nested club sponsor creation', async () => {
		await expect(
			request(app, '/clubs/club-1/sponsors', {
				method: 'POST',
				headers: {
					'x-test-role': ROLES.CLUB_ADMIN,
					'content-type': 'application/json',
				},
				body: JSON.stringify({ name: 'Court Partner', link: '' }),
			})
		).resolves.toEqual({
			status: 200,
			body: {
				handler: 'createSponsor',
				params: { clubId: 'club-1' },
				body: { name: 'Court Partner', link: null },
				role: ROLES.CLUB_ADMIN,
			},
		});
	});
});
