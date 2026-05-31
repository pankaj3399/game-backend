import { Types } from 'mongoose';
import Tournament from '../../../../models/Tournament';
import { addParticipantIfCapacityAllows } from '../queries';

jest.mock('../../../../models/Tournament');

const mockFindOneAndUpdate = Tournament.findOneAndUpdate as jest.MockedFunction<
	typeof Tournament.findOneAndUpdate
>;

const TOURNAMENT_ID = '507f1f77bcf86cd799439011';
const USER_ID = new Types.ObjectId('507f1f77bcf86cd799439012');

beforeEach(() => {
	jest.clearAllMocks();
});

describe('addParticipantIfCapacityAllows', () => {
	it('queries active tournaments below maxMember and adds participant atomically', async () => {
		const chain = {
			select: jest.fn().mockReturnThis(),
			lean: jest.fn().mockReturnThis(),
			exec: jest.fn().mockResolvedValue({ participants: [USER_ID], maxMember: 8 }),
		};
		mockFindOneAndUpdate.mockReturnValue(chain as never);

		const result = await addParticipantIfCapacityAllows(TOURNAMENT_ID, USER_ID);

		expect(result).toEqual({ participants: [USER_ID], maxMember: 8 });
		expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
			{
				_id: TOURNAMENT_ID,
				status: 'active',
				$expr: {
					$or: [
						{ $not: [{ $isNumber: '$maxMember' }] },
						{
							$lt: [{ $size: { $ifNull: ['$participants', []] } }, '$maxMember'],
						},
					],
				},
			},
			{ $addToSet: { participants: USER_ID } },
			{ returnDocument: 'after' },
		);
		expect(chain.select).toHaveBeenCalledWith('participants maxMember');
	});

	it('returns null when tournament is full or not joinable', async () => {
		const chain = {
			select: jest.fn().mockReturnThis(),
			lean: jest.fn().mockReturnThis(),
			exec: jest.fn().mockResolvedValue(null),
		};
		mockFindOneAndUpdate.mockReturnValue(chain as never);

		const result = await addParticipantIfCapacityAllows(TOURNAMENT_ID, USER_ID);

		expect(result).toBeNull();
	});
});
