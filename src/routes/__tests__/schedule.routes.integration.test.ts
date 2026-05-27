import { ROLES } from '../../constants/roles';
import scheduleRouter from '../schedule.routes';
import { buildJsonApp, request } from '../../testUtils/routeIntegrationTestUtils';

jest.mock('../../middlewares/auth', () => ({
	__esModule: true,
	default: require('../../testUtils/routeMockAuth').attachTestUser,
}));

jest.mock('../../controllers/schedule/controller', () => {
	const { controllerMarker } = require('../../testUtils/routeIntegrationTestUtils');
	return {
		cancelScheduleRound: controllerMarker('cancelScheduleRound'),
		generateDoublesPairs: controllerMarker('generateDoublesPairs'),
		generateSchedule: controllerMarker('generateSchedule'),
		getSchedule: controllerMarker('getSchedule'),
	};
});

describe('schedule routes integration', () => {
	const app = buildJsonApp('/schedules', scheduleRouter);

	it('requires auth before schedule RBAC', async () => {
		await expect(request(app, '/schedules/tournament-1')).resolves.toEqual({
			status: 401,
			body: { message: 'Authorization required' },
		});
	});

	it('rejects players from organiser schedule routes', async () => {
		await expect(
			request(app, '/schedules/tournament-1', { headers: { 'x-test-role': ROLES.PLAYER } })
		).resolves.toEqual({
			status: 403,
			body: {
				message: 'Insufficient permissions',
				code: 'FORBIDDEN',
			},
		});
	});

	it('allows organisers to read schedule data', async () => {
		await expect(
			request(app, '/schedules/tournament-1', { headers: { 'x-test-role': ROLES.ORGANISER } })
		).resolves.toEqual({
			status: 200,
			body: {
				handler: 'getSchedule',
				params: { id: 'tournament-1' },
				body: {},
				role: ROLES.ORGANISER,
			},
		});
	});

	it('routes round cancellation with both params', async () => {
		await expect(
			request(app, '/schedules/tournament-1/round/2', {
				method: 'DELETE',
				headers: { 'x-test-role': ROLES.CLUB_ADMIN },
			})
		).resolves.toEqual({
			status: 200,
			body: {
				handler: 'cancelScheduleRound',
				params: { id: 'tournament-1', round: '2' },
				body: {},
				role: ROLES.CLUB_ADMIN,
			},
		});
	});
});
