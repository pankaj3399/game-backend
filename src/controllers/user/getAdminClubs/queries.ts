import mongoose from 'mongoose';
import Court from '../../../models/Court';
import User from '../../../models/User';
import type {  CourtCountRow, UserAdminClubsDoc } from './types';

export async function findUserAdminClubs(userId: string) {
	const user = await User.findById(userId)
		.populate({
			path: 'adminOf',
			select: '_id name',
			model: 'Club'
		})
		.select('adminOf')
		.lean<UserAdminClubsDoc>()
		.exec();

	if (!user) {
		return null;
	}

	return user.adminOf;
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
