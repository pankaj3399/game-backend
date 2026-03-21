import mongoose from 'mongoose';
import Court from '../../../models/Court';
import Club from '../../../models/Club';
import User from '../../../models/User';
import type { AdminClubDoc, CourtCountRow, UserAdminClubsDoc } from './types';

export async function findUserAdminClubs(userId: string) {
	const [user, organiserClubs] = await Promise.all([
		User.findById(userId)
			.populate({
				path: 'adminOf',
				select: '_id name',
				model: 'Club'
			})
			.select('adminOf')
			.lean<UserAdminClubsDoc>()
			.exec(),
		Club.find({ organiserIds: userId })
			.select('_id name')
			.lean<AdminClubDoc[]>()
			.exec()
	]);

	if (!user) {
		return null;
	}

	const merged = new Map<string, AdminClubDoc>();

	for (const club of user.adminOf ?? []) {
		merged.set(club._id.toString(), club);
	}

	for (const club of organiserClubs ?? []) {
		merged.set(club._id.toString(), club);
	}

	return Array.from(merged.values());
}

export async function findCourtCountsByClub(clubIds: mongoose.Types.ObjectId[]) {
	if (!clubIds.length) {
		return new Map<string, number>();
	}

	const courtCounts = await Court.aggregate<CourtCountRow>([
		{ $match: { club: { $in: clubIds } } },
		{ $group: { _id: '$club', count: { $sum: 1 } } }
	]).exec();

	return new Map(courtCounts.map((item) => [item._id.toString(), item.count]));
}
