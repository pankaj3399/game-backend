import { ROLES } from '../../constants/roles';
import adminRouter from '../admin.routes';
import { buildJsonApp, request } from '../../testUtils/routeIntegrationTestUtils';

jest.mock('../../middlewares/auth', () => ({
	__esModule: true,
	default: require('../../testUtils/routeMockAuth').attachTestUser,
}));

jest.mock('../../controllers/admin/getClubSubscriptionsOverview', () => {
	const { controllerMarker } = require('../../testUtils/routeIntegrationTestUtils');
	return {
		getClubSubscriptionsOverview: controllerMarker('getClubSubscriptionsOverview'),
	};
});

jest.mock('../../controllers/admin/updateClubSubscription', () => {
	const { controllerMarker } = require('../../testUtils/routeIntegrationTestUtils');
	return {
		updateClubSubscription: controllerMarker('updateClubSubscription'),
	};
});

jest.mock('../../controllers/admin/platformSponsors', () => {
	const { controllerMarker } = require('../../testUtils/routeIntegrationTestUtils');
	return {
		createPlatformSponsor: controllerMarker('createPlatformSponsor'),
		deletePlatformSponsor: controllerMarker('deletePlatformSponsor'),
		getPlatformSponsors: controllerMarker('getPlatformSponsors'),
		updatePlatformSponsor: controllerMarker('updatePlatformSponsor'),
	};
});

describe('admin routes integration', () => {
	const app = buildJsonApp('/admin', adminRouter);

	it('requires authentication before admin RBAC', async () => {
		await expect(request(app, '/admin/ping')).resolves.toEqual({
			status: 401,
			body: { message: 'Authorization required' },
		});
	});

	it('rejects non-super-admin users', async () => {
		await expect(
			request(app, '/admin/ping', { headers: { 'x-test-role': ROLES.CLUB_ADMIN } })
		).resolves.toEqual({
			status: 403,
			body: {
				message: 'Insufficient permissions',
				code: 'FORBIDDEN',
			},
		});
	});

	it('allows super admins through the ping route', async () => {
		await expect(
			request(app, '/admin/ping', { headers: { 'x-test-role': ROLES.SUPER_ADMIN } })
		).resolves.toEqual({
			status: 200,
			body: { message: 'Admin access granted', role: 'super_admin' },
		});
	});

	it('routes platform sponsor management for super admins', async () => {
		await expect(
			request(app, '/admin/sponsors/sponsor-1', {
				method: 'PATCH',
				headers: { 'x-test-role': ROLES.SUPER_ADMIN },
				body: JSON.stringify({ name: 'Updated' }),
			})
		).resolves.toEqual({
			status: 200,
			body: {
				handler: 'updatePlatformSponsor',
				params: { sponsorId: 'sponsor-1' },
				body: { name: 'Updated' },
				role: ROLES.SUPER_ADMIN,
			},
		});
	});
});
