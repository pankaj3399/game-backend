import { Types } from 'mongoose';
import Sponsor from '../../../../models/Sponsor';
import { createSponsorFlow } from '../handler';

jest.mock('../../../../models/Sponsor');

const mockCreate = Sponsor.create as jest.MockedFunction<typeof Sponsor.create>;

const CLUB_ID = '507f1f77bcf86cd799439011';
const SPONSOR_ID = new Types.ObjectId('507f1f77bcf86cd799439012');

const validInput = {
	name: 'Acme Sports',
	description: 'Premium gear',
	logoUrl: 'https://example.com/logo.png',
	link: 'https://example.com',
};

beforeEach(() => {
	jest.clearAllMocks();
});

describe('createSponsorFlow', () => {
	it('returns 201 with mapped sponsor on success', async () => {
		mockCreate.mockResolvedValue({
			_id: SPONSOR_ID,
			name: validInput.name,
			description: validInput.description,
			logoUrl: validInput.logoUrl,
			link: validInput.link,
			status: 'active',
		} as never);

		const result = await createSponsorFlow(validInput, CLUB_ID);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.status).toBe(201);
			expect(result.data.sponsor).toEqual({
				id: SPONSOR_ID.toString(),
				name: 'Acme Sports',
				description: 'Premium gear',
				logoUrl: validInput.logoUrl,
				link: validInput.link,
				status: 'active',
			});
		}
		expect(mockCreate).toHaveBeenCalledWith({
			name: validInput.name,
			description: validInput.description,
			logoUrl: validInput.logoUrl,
			link: validInput.link,
			scope: 'club',
			club: CLUB_ID,
			status: 'active',
		});
	});

	it('returns 409 on duplicate sponsor name', async () => {
		const duplicateError = Object.assign(new Error('duplicate'), {
			code: 11000,
			name: 'MongoServerError',
			keyPattern: { name: 1 },
		});
		mockCreate.mockRejectedValue(duplicateError);

		const result = await createSponsorFlow(validInput, CLUB_ID);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.status).toBe(409);
			expect(result.message).toMatch(/already exists/i);
		}
	});
});
