import mongoose from 'mongoose';
import Sponsor from '../../../models/Sponsor';
import Tournament from '../../../models/Tournament';
import { error, ok } from '../../../shared/helpers';

export async function deleteSponsorFlow(club: string, sponsorId: string) {
	const session = await mongoose.startSession();
	try {
		const result = await session.withTransaction(async () => {
			const sponsorDeleteResult = await Sponsor.deleteOne(
				{
					_id: sponsorId,
					scope: 'club',
					club: club
				},
				{ session }
			);

			if (sponsorDeleteResult.deletedCount === 0) {
				return sponsorDeleteResult;
			}

			// Prevent dangling sponsor references in tournaments after sponsor deletion.
			await Tournament.updateMany(
				{
					club: club,
					sponsor: sponsorId
				},
				{
					$set: { sponsor: null },
					$unset: { sponsorId: '' }
				},
				{ session }
			).exec();

			return sponsorDeleteResult;
		});

		if (!result || result.deletedCount === 0) {
			return error(404, 'Sponsor not found');
		}

		return ok({}, { status: 204, message: 'Sponsor deleted' });
	} finally {
		await session.endSession();
	}
}
