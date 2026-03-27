import mongoose from 'mongoose';
import { ROLES } from '../../../constants/roles';
import Court from '../../../models/Court';
import Club from '../../../models/Club';
import Tournament from '../../../models/Tournament';
import User from '../../../models/User';
import type { AdminClubDoc, CourtCountRow, UserAdminClubsDoc } from './types';

type UserMembersByClubRow = {
	_id: mongoose.Types.ObjectId;
	count: number;
};

type ClubOrganiserSnapshot = {
	_id: mongoose.Types.ObjectId;
	organiserIds?: mongoose.Types.ObjectId[];
};

type ActiveOrganiserMembershipDoc = {
	_id: mongoose.Types.ObjectId;
	favoriteClubs?: mongoose.Types.ObjectId[];
	adminOf?: mongoose.Types.ObjectId[];
};

export async function findUserAdminClubs(userId: string) {
	const [user, organiserClubs] = await Promise.all([
		User.findById(userId)
			.populate({
				path: 'adminOf',
				select: '_id name',
				model: 'Club'
			})
			.select('adminOf role')
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

	if (user.role === ROLES.SUPER_ADMIN) {
		return Club.find({})
			.select('_id name')
			.lean<AdminClubDoc[]>()
			.exec();
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

/**
 * Member count per club as the union of distinct users who favorited the club,
 * are admins of the club, or are active organisers on the club. Soft-deleted
 * users never count; only organisers that are not soft-deleted are included.
 *
 * @param clubIds - Club `_id`s to aggregate counts for.
 * @returns `Map` from each club id string (`ObjectId.toString()`) to member
 *   count. A user appears at most once per club (favorites ∪ admins per user
 *   is de-duplicated in the pipeline; organisers are merged into the same set).
 */
export async function findClubMemberCountsByClub(clubIds: mongoose.Types.ObjectId[]) {
	if (!clubIds.length) {
		return new Map<string, number>();
	}

	const notDeleted = {
		$or: [{ deletedAt: null }, { deletedAt: { $exists: false } }]
	};

	const [userMembersByClub, clubs] = await Promise.all([
		User.aggregate<UserMembersByClubRow>([
			{
				$match: {
					$and: [
						notDeleted,
						{
							$or: [
								{ favoriteClubs: { $in: clubIds } },
								{ adminOf: { $in: clubIds } }
							]
						}
					]
				}
			},
			{
				$project: {
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
			{ $group: { _id: '$memberClubIds', count: { $sum: 1 } } }
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
		? await User.find({ ...notDeleted, _id: { $in: organiserIds } })
				.select('_id favoriteClubs adminOf')
				.lean<ActiveOrganiserMembershipDoc[]>()
				.exec()
		: [];

	const activeOrganiserIds = new Set(activeOrganiserRows.map((user) => user._id.toString()));

	const clubIdStrSet = new Set(clubIds.map((id) => id.toString()));
	const activeOrganiserMemberClubIds = new Map<string, Set<string>>();
	for (const user of activeOrganiserRows) {
		const memberClubIds = new Set<string>();
		for (const favoriteClubId of user.favoriteClubs ?? []) {
			const idStr = favoriteClubId.toString();
			if (clubIdStrSet.has(idStr)) {
				memberClubIds.add(idStr);
			}
		}
		for (const adminClubId of user.adminOf ?? []) {
			const idStr = adminClubId.toString();
			if (clubIdStrSet.has(idStr)) {
				memberClubIds.add(idStr);
			}
		}
		activeOrganiserMemberClubIds.set(user._id.toString(), memberClubIds);
	}

	const baseCounts = new Map<string, number>();
	for (const row of userMembersByClub) {
		baseCounts.set(row._id.toString(), row.count);
	}

	const countsByClubId = new Map(baseCounts);

	for (const club of clubs) {
		const clubId = club._id.toString();
		const baseCount = baseCounts.get(clubId) ?? 0;
		let numActiveOrganisers = 0;
		for (const organiserId of club.organiserIds ?? []) {
			const organiserIdStr = organiserId.toString();
			if (!activeOrganiserIds.has(organiserIdStr)) {
				continue;
			}
			if (activeOrganiserMemberClubIds.get(organiserIdStr)?.has(clubId)) {
				continue;
			}
			numActiveOrganisers += 1;
		}
		countsByClubId.set(clubId, baseCount + numActiveOrganisers);
	}

	return countsByClubId;
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
