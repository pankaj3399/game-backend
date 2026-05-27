import { ROLES } from '../../constants/roles';
import userRouter from '../user.routes';
import { buildJsonApp, request } from '../../testUtils/routeIntegrationTestUtils';

jest.mock('../../middlewares/auth', () => ({
	__esModule: true,
	default: require('../../testUtils/routeMockAuth').attachTestUser,
}));

jest.mock('../../controllers/user/controller', () => {
	const { controllerMarker } = require('../../testUtils/routeIntegrationTestUtils');
	return {
		updateProfile: controllerMarker('updateProfile'),
		deleteAccount: controllerMarker('deleteAccount'),
		getFavoriteClubs: controllerMarker('getFavoriteClubs'),
		addFavoriteClub: controllerMarker('addFavoriteClub'),
		removeFavoriteClub: controllerMarker('removeFavoriteClub'),
		setHomeClub: controllerMarker('setHomeClub'),
		getAdminClubs: controllerMarker('getAdminClubs'),
		searchUsers: controllerMarker('searchUsers'),
		getMyScore: controllerMarker('getMyScore'),
	};
});

describe('user routes integration', () => {
	const app = buildJsonApp('/users', userRouter);

	it('requires authentication for protected user routes', async () => {
		await expect(request(app, '/users/favorite-clubs')).resolves.toEqual({
			status: 401,
			body: { message: 'Authorization required' },
		});
	});

	it('allows players to reach their score endpoint', async () => {
		await expect(
			request(app, '/users/my-score', { headers: { 'x-test-role': ROLES.PLAYER } })
		).resolves.toEqual({
			status: 200,
			body: {
				handler: 'getMyScore',
				params: {},
				body: {},
				role: ROLES.PLAYER,
			},
		});
	});

	it('blocks players from organiser user search', async () => {
		await expect(
			request(app, '/users/search?q=ann', { headers: { 'x-test-role': ROLES.PLAYER } })
		).resolves.toEqual({
			status: 403,
			body: {
				message: 'Insufficient permissions',
				code: 'FORBIDDEN',
			},
		});
	});

	it('allows organisers to use user search', async () => {
		await expect(
			request(app, '/users/search?q=ann', { headers: { 'x-test-role': ROLES.ORGANISER } })
		).resolves.toEqual({
			status: 200,
			body: {
				handler: 'searchUsers',
				params: {},
				body: {},
				role: ROLES.ORGANISER,
			},
		});
	});

	it('routes favorite club mutations with path params', async () => {
		await expect(
			request(app, '/users/favorite-clubs/club-1', {
				method: 'DELETE',
				headers: { 'x-test-role': ROLES.PLAYER },
			})
		).resolves.toEqual({
			status: 200,
			body: {
				handler: 'removeFavoriteClub',
				params: { clubId: 'club-1' },
				body: {},
				role: ROLES.PLAYER,
			},
		});
	});
});
