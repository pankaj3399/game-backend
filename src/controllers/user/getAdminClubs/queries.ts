import mongoose from 'mongoose';
import Court from '../../../models/Court';
import Club from '../../../models/Club';
import Tournament from '../../../models/Tournament';
import User from '../../../models/User';
import type { AdminClubDoc, CourtCountRow, UserAdminClubsDoc } from './types';

type MemberIdsByClubRow = {
	_id: mongoose.Types.ObjectId;
	memberIds: mongoose.Types.ObjectId[];
};

type ClubOrganiserSnapshot = {
	_id: mongoose.Types.ObjectId;
	organiserIds?: mongoose.Types.ObjectId[];
};

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

	return Array.from(merged.values()).sort((left, right) => {
		const byName = left.name.localeCompare(right.name);

		if (byName !== 0) {
			return byName;
		}

		return left._id.toString().localeCompare(right._id.toString());
	});
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

/** Users who favorited the club (excludes soft-deleted accounts). */
export async function findClubMemberCountsByClub(clubIds: mongoose.Types.ObjectId[]) {
	if (!clubIds.length) {
		return new Map<string, number>();
	}

	const notDeleted = {
		$or: [{ deletedAt: null }, { deletedAt: { $exists: false } }]
	};

	const [userMembersByClub, clubs] = await Promise.all([
		User.aggregate<MemberIdsByClubRow>([
			{
				$match: {
					...notDeleted,
					$or: [{ favoriteClubs: { $in: clubIds } }, { adminOf: { $in: clubIds } }]
				}
			},
			{
				$project: {
					userId: '$_id',
					memberClubIds: {
						$setUnion: [
							{
								$filter: {
									input: '$favoriteClubs',
									as: 'clubId',
									cond: { $in: ['$$clubId', clubIds] }
								}
							},
							{
								$filter: {
									input: '$adminOf',
									as: 'clubId',
									cond: { $in: ['$$clubId', clubIds] }
								}
							}
						]
					}
				}
			},
			{ $unwind: '$memberClubIds' },
			{ $group: { _id: '$memberClubIds', memberIds: { $addToSet: '$userId' } } }
		]).exec(),
		Club.find({ _id: { $in: clubIds } }).select('_id organiserIds').lean<ClubOrganiserSnapshot[]>().exec()
	]);

	const organiserIdSet = new Set<string>();
	for (const club of clubs) {
		for (const organiserId of club.organiserIds ?? []) {
			organiserIdSet.add(organiserId.toString());
		}
	}

	const organiserIds = Array.from(organiserIdSet).map((value) => new mongoose.Types.ObjectId(value));

	const activeOrganiserRows = organiserIds.length
		? await User.find({ _id: { $in: organiserIds } }).select('_id').lean<{ _id: mongoose.Types.ObjectId }[]>().exec()
		: [];

	const activeOrganiserIds = new Set(activeOrganiserRows.map((user) => user._id.toString()));
	const membersByClub = new Map<string, Set<string>>();

	for (const row of userMembersByClub) {
		const clubId = row._id.toString();
		membersByClub.set(
			clubId,
			new Set((row.memberIds ?? []).map((memberId) => memberId.toString()))
		);
	}

	for (const club of clubs) {
		const clubId = club._id.toString();
		const memberIds = membersByClub.get(clubId) ?? new Set<string>();

		for (const organiserId of club.organiserIds ?? []) {
			const organiserIdString = organiserId.toString();
			if (activeOrganiserIds.has(organiserIdString)) {
				memberIds.add(organiserIdString);
			}
		}

		membersByClub.set(clubId, memberIds);
	}

	return new Map(Array.from(membersByClub.entries()).map(([clubId, memberIds]) => [clubId, memberIds.size]));
}

export async function findTournamentCountsByClub(clubIds: mongoose.Types.ObjectId[]) {
	if (!clubIds.length) {
		return new Map<string, number>();
	}

	const tournamentCounts = await Tournament.aggregate<CourtCountRow>([
		{ $match: { club: { $in: clubIds } } },
		{ $group: { _id: '$club', count: { $sum: 1 } } }
	]).exec();

	return new Map(tournamentCounts.map((item) => [item._id.toString(), item.count]));
}
