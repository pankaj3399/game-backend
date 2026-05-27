import playersRouter from '../players.routes';
import { buildJsonApp, controllerMarker, request } from '../../testUtils/routeIntegrationTestUtils';

jest.mock('../../controllers/user/getPlayerScore/index', () => {
	const { controllerMarker } = require('../../testUtils/routeIntegrationTestUtils');
	return {
		getPlayerScore: controllerMarker('getPlayerScore'),
	};
});

describe('players routes integration', () => {
	const app = buildJsonApp('/players', playersRouter);

	it('keeps public player score lookups open and passes user id params', async () => {
		await expect(request(app, '/players/user-1/score')).resolves.toEqual({
			status: 200,
			body: {
				handler: 'getPlayerScore',
				params: { userId: 'user-1' },
				body: {},
				role: null,
			},
		});
	});
});
