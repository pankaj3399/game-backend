import { ROLES } from '../../constants/roles';
import authRouter from '../auth.routes';
import { attachTestUser } from '../../testUtils/routeMockAuth';
import { buildJsonApp, controllerMarker, request } from '../../testUtils/routeIntegrationTestUtils';

jest.mock('../../middlewares/auth', () => ({
	__esModule: true,
	default: require('../../testUtils/routeMockAuth').attachTestUser,
}));

jest.mock('../../controllers/auth/controller', () => {
	const { controllerMarker } = require('../../testUtils/routeIntegrationTestUtils');
	return {
		appleAuth: controllerMarker('appleAuth'),
		appleAuthCallback: controllerMarker('appleAuthCallback'),
		appleFormPostFix: controllerMarker('appleFormPostFix'),
		completeSignUp: controllerMarker('completeSignUp'),
		exchangeAuthHandoff: controllerMarker('exchangeAuthHandoff'),
		getMe: controllerMarker('getMe'),
		googleAuth: controllerMarker('googleAuth'),
		googleAuthCallback: controllerMarker('googleAuthCallback'),
		logout: controllerMarker('logout'),
	};
});

describe('auth routes integration', () => {
	const app = buildJsonApp('/auth', authRouter);

	it('routes public OAuth entrypoints without authentication', async () => {
		await expect(request(app, '/auth/google')).resolves.toEqual({
			status: 200,
			body: {
				handler: 'googleAuth',
				params: {},
				body: {},
				role: null,
			},
		});
	});

	it('runs complete-signup validation before the controller', async () => {
		await expect(
			request(app, '/auth/complete-signup', {
				method: 'POST',
				body: JSON.stringify({ pendingToken: '', alias: '', name: '' }),
			})
		).resolves.toMatchObject({
			status: 400,
			body: {
				error: true,
				code: 'VALIDATION_ERROR',
			},
		});
	});

	it('passes normalized complete-signup payloads to the controller', async () => {
		const result = await request(app, '/auth/complete-signup', {
			method: 'POST',
			body: JSON.stringify({
				pendingToken: 'pending-token',
				alias: '  ace  ',
				name: '  Ada  ',
				email: 'ada@example.com',
				gender: '',
			}),
		});

		expect(result.status).toBe(200);
		expect(result.body).toMatchObject({
			handler: 'completeSignUp',
			body: {
				pendingToken: 'pending-token',
				alias: 'ace',
				name: 'Ada',
				email: 'ada@example.com',
				gender: null,
			},
		});
	});

	it('requires authentication for /me', async () => {
		await expect(request(app, '/auth/me')).resolves.toEqual({
			status: 401,
			body: { message: 'Authorization required' },
		});
	});

	it('routes authenticated /me requests', async () => {
		await expect(
			request(app, '/auth/me', { headers: { 'x-test-role': ROLES.PLAYER } })
		).resolves.toEqual({
			status: 200,
			body: {
				handler: 'getMe',
				params: {},
				body: {},
				role: ROLES.PLAYER,
			},
		});
	});
});
