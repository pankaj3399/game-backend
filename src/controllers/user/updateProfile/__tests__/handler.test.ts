import { updateProfileFlow } from '../handler';
import * as queries from '../queries';

jest.mock('../queries');

const mockUpdate = queries.updateUserProfileById as jest.MockedFunction<
	typeof queries.updateUserProfileById
>;

const USER_ID = '507f1f77bcf86cd799439011';

beforeEach(() => {
	jest.clearAllMocks();
});

describe('updateProfileFlow', () => {
	it('returns 404 when user not found', async () => {
		mockUpdate.mockResolvedValue(null);
		const result = await updateProfileFlow(USER_ID, { alias: 'new' });
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.status).toBe(404);
	});

	it('returns ok when profile updates', async () => {
		mockUpdate.mockResolvedValue({ _id: USER_ID } as never);
		const result = await updateProfileFlow(USER_ID, { name: 'Alice' });
		expect(result.ok).toBe(true);
		expect(mockUpdate).toHaveBeenCalledWith(
			USER_ID,
			expect.objectContaining({ name: 'Alice' }),
		);
	});

	it('returns 500 on unexpected errors', async () => {
		mockUpdate.mockRejectedValue(new Error('db down'));
		const result = await updateProfileFlow(USER_ID, { alias: 'x' });
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.status).toBe(500);
	});
});
