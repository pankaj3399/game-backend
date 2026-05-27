import mongoose from 'mongoose';
import { ROLES } from '../../constants/roles';
import Club from '../../models/Club';
import Sponsor from '../../models/Sponsor';
import sponsorRouter from '../sponsor.routes';
import { buildJsonApp, request } from '../../testUtils/routeIntegrationTestUtils';

jest.mock('../../middlewares/auth', () => ({
	__esModule: true,
	default: require('../../testUtils/routeMockAuth').attachTestUser,
}));

jest.mock('../../models/Club', () => ({
	__esModule: true,
	default: {
		exists: jest.fn(),
		findById: jest.fn(),
	},
}));

jest.mock('../../models/Sponsor', () => ({
	__esModule: true,
	default: {
		create: jest.fn(),
		find: jest.fn(),
		findOne: jest.fn(),
	},
}));

const mockClubExists = jest.mocked(Club.exists);
const mockClubFindById = jest.mocked(Club.findById);
const mockSponsorCreate = jest.mocked(Sponsor.create);
const mockSponsorFind = jest.mocked(Sponsor.find);
const mockSponsorFindOne = jest.mocked(Sponsor.findOne);

function query<T>(value: T) {
	const chain = {
		select: jest.fn(),
		lean: jest.fn(),
		exec: jest.fn<Promise<T>, []>().mockResolvedValue(value),
	};
	chain.select.mockReturnValue(chain);
	chain.lean.mockReturnValue(chain);
	return chain;
}

function sponsorDoc(data: {
	id: string;
	name: string;
	status?: 'active' | 'paused';
	logoUrl?: string | null;
	link?: string | null;
}) {
	return {
		_id: { toString: () => data.id },
		name: data.name,
		logoUrl: data.logoUrl ?? null,
		link: data.link ?? null,
		status: data.status ?? 'active',
		save: jest.fn().mockResolvedValue(undefined),
	};
}

describe('sponsor routes integration', () => {
	const app = buildJsonApp('/sponsors', sponsorRouter);
	const clubId = new mongoose.Types.ObjectId();
	const sponsorId = new mongoose.Types.ObjectId();

	beforeEach(() => {
		jest.clearAllMocks();
		mockClubExists.mockResolvedValue({ _id: clubId });
		mockClubFindById.mockReturnValue(query({ _id: clubId, plan: 'premium' }) as unknown as ReturnType<typeof Club.findById>);
		mockSponsorFind.mockReturnValue(query([]) as unknown as ReturnType<typeof Sponsor.find>);
	});

	it('keeps the public sponsor list open and deduplicates by name/link', async () => {
		mockSponsorFind.mockReturnValue(
			query([
				{ _id: 'sponsor-1', name: 'Global Partner', logoUrl: '/a.png', link: 'https://a.example' },
				{ _id: 'sponsor-2', name: 'Global Partner', logoUrl: '/dup.png', link: 'https://a.example' },
				{ _id: 'sponsor-3', name: 'Second Partner', logoUrl: null, link: null },
			]) as unknown as ReturnType<typeof Sponsor.find>
		);

		await expect(request(app, '/sponsors')).resolves.toEqual({
			status: 200,
			body: {
				sponsors: [
					{
						id: 'sponsor-1',
						name: 'Global Partner',
						description: null,
						logoUrl: '/a.png',
						link: 'https://a.example',
					},
					{
						id: 'sponsor-3',
						name: 'Second Partner',
						description: null,
						logoUrl: null,
						link: null,
					},
				],
			},
		});
		expect(mockSponsorFind).toHaveBeenCalledWith({ status: 'active', scope: 'global' });
	});

	it('requires auth for club sponsor management', async () => {
		await expect(request(app, `/sponsors/clubs/${clubId.toString()}`)).resolves.toEqual({
			status: 401,
			body: { message: 'Authorization required' },
		});
	});

	it('returns club sponsors with subscription capabilities', async () => {
		mockSponsorFind.mockReturnValue(
			query([
				{
					_id: { toString: () => sponsorId.toString() },
					name: 'Club Partner',
					description: 'Visible in club',
					logoUrl: '/club.png',
					link: null,
					status: 'active',
				},
			]) as unknown as ReturnType<typeof Sponsor.find>
		);

		await expect(
			request(app, `/sponsors/clubs/${clubId.toString()}`, {
				headers: { 'x-test-role': ROLES.ORGANISER },
			})
		).resolves.toEqual({
			status: 200,
			body: {
				sponsors: [
					{
						id: sponsorId.toString(),
						name: 'Club Partner',
						description: 'Visible in club',
						logoUrl: '/club.png',
						link: null,
						status: 'active',
					},
				],
				subscription: {
					plan: 'premium',
					canManageSponsors: true,
				},
			},
		});
		expect(mockClubExists).toHaveBeenCalledWith({
			_id: clubId.toString(),
			organiserIds: expect.any(String),
		});
	});

	it('blocks sponsor creation for users who cannot manage the club', async () => {
		mockClubExists.mockResolvedValue(null);

		await expect(
			request(app, `/sponsors/clubs/${clubId.toString()}`, {
				method: 'POST',
				headers: { 'x-test-role': ROLES.ORGANISER },
				body: JSON.stringify({ name: 'Blocked Partner' }),
			})
		).resolves.toEqual({
			status: 403,
			body: {
				message: 'You do not have permission to manage this club',
				error: true,
			},
		});
		expect(mockSponsorCreate).not.toHaveBeenCalled();
	});

	it('creates sponsors for premium clubs through the real controller flow', async () => {
		mockSponsorCreate.mockResolvedValue(
			sponsorDoc({
				id: sponsorId.toString(),
				name: 'Created Partner',
				logoUrl: null,
				link: 'https://created.example',
			}) as unknown as Awaited<ReturnType<typeof Sponsor.create>>
		);

		await expect(
			request(app, `/sponsors/clubs/${clubId.toString()}`, {
				method: 'POST',
				headers: { 'x-test-role': ROLES.CLUB_ADMIN },
				body: JSON.stringify({
					name: ' Created Partner ',
					description: '  Sponsor text  ',
					link: 'https://created.example',
				}),
			})
		).resolves.toEqual({
			status: 201,
			body: {
				id: sponsorId.toString(),
				name: 'Created Partner',
				description: null,
				logoUrl: null,
				link: 'https://created.example',
				status: 'active',
			},
		});
		expect(mockSponsorCreate).toHaveBeenCalledWith({
			name: 'Created Partner',
			description: 'Sponsor text',
			logoUrl: null,
			link: 'https://created.example',
			scope: 'club',
			club: clubId.toString(),
			status: 'active',
		});
	});

	it('prevents free clubs from activating sponsors on update', async () => {
		mockClubFindById.mockReturnValue(query({ _id: clubId, plan: 'free' }) as unknown as ReturnType<typeof Club.findById>);
		mockSponsorFindOne.mockReturnValue(
			query(sponsorDoc({ id: sponsorId.toString(), name: 'Paused Partner', status: 'paused' })) as unknown as ReturnType<typeof Sponsor.findOne>
		);

		await expect(
			request(app, `/sponsors/clubs/${clubId.toString()}/${sponsorId.toString()}`, {
				method: 'PATCH',
				headers: { 'x-test-role': ROLES.CLUB_ADMIN },
				body: JSON.stringify({ status: 'active' }),
			})
		).resolves.toEqual({
			status: 403,
			body: {
				message: 'Cannot activate sponsors on a free plan. Upgrade to premium.',
				error: true,
			},
		});
	});

	it('updates sponsor fields through the real controller flow', async () => {
		const existingSponsor = sponsorDoc({
			id: sponsorId.toString(),
			name: 'Old Partner',
			status: 'active',
		});
		mockSponsorFindOne.mockReturnValue(query(existingSponsor) as unknown as ReturnType<typeof Sponsor.findOne>);

		await expect(
			request(app, `/sponsors/clubs/${clubId.toString()}/${sponsorId.toString()}`, {
				method: 'PATCH',
				headers: { 'x-test-role': ROLES.CLUB_ADMIN },
				body: JSON.stringify({
					name: ' Updated Partner ',
					logoUrl: '',
					status: 'paused',
				}),
			})
		).resolves.toEqual({
			status: 200,
			body: {
				id: sponsorId.toString(),
				name: 'Updated Partner',
				logoUrl: null,
				link: null,
				status: 'paused',
			},
		});
		expect(existingSponsor.save).toHaveBeenCalledTimes(1);
	});
});
