import { listClubsFlow } from '../handler';
import * as queries from '../queries';
import * as resolveModule from '../resolveAllowedClubIds';

jest.mock('../queries');
jest.mock('../resolveAllowedClubIds');

const mockListPage = queries.listActiveClubsPage as jest.MockedFunction<
	typeof queries.listActiveClubsPage
>;
const mockResolve = resolveModule.resolveAllowedClubIdsForList as jest.MockedFunction<
	typeof resolveModule.resolveAllowedClubIdsForList
>;

const defaultQuery = { page: 1, limit: 10, q: '', clubScope: 'all' as const, distance: 'all' as const };

beforeEach(() => {
	jest.clearAllMocks();
	mockResolve.mockResolvedValue({ ok: true, allowedClubIds: undefined });
	mockListPage.mockResolvedValue({
		totalCount: 1,
		clubs: [{ _id: { toString: () => '507f1f77bcf86cd799439011' }, name: 'Club', address: 'Addr', logoUrl: null, website: null }],
	});
});

describe('listClubsFlow', () => {
	it('returns 401 for scoped filters without user', async () => {
		const result = await listClubsFlow(
			{ ...defaultQuery, clubScope: 'favorites' },
			null,
		);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.status).toBe(401);
	});

	it('returns paginated clubs for anonymous all-scope query', async () => {
		const result = await listClubsFlow(defaultQuery, null);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data.clubs).toHaveLength(1);
			expect(result.data.pagination.totalCount).toBe(1);
		}
	});

	it('propagates resolve errors for authenticated scoped lists', async () => {
		mockResolve.mockResolvedValue({ ok: false, status: 403, message: 'Forbidden' });
		const result = await listClubsFlow(
			{ ...defaultQuery, clubScope: 'managed' },
			'507f1f77bcf86cd799439011',
		);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.status).toBe(403);
	});
});
