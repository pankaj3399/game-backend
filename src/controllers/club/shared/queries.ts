import mongoose, { type ClientSession } from 'mongoose';
import Club from '../../../models/Club';
import User from '../../../models/User';

export type TransferClubDefaultAdminIfExpectedCode =
	| 'ok'
	| 'club_not_found'
	| 'stale_main_admin'
	| 'target_not_admin';

export async function findClubStaffSnapshotById(clubId: string, session?: ClientSession | null) {
	let q = Club.findById(clubId).select('defaultAdminId organiserIds').lean();
	if (session) {
		q = q.session(session);
	}
	return q.exec();
}

export async function findClubStaffUserSnapshotById(userId: string, session?: ClientSession | null) {
	let q = User.findById(userId).select('_id email name alias adminOf').lean();
	if (session) {
		q = q.session(session);
	}
	return q.exec();
}

export async function isUserAdminOfClub(clubId: string, userId: string) {
	const existing = await User.exists({ _id: userId, adminOf: clubId });
	return !!existing;
}

export async function isUserOrganiserOfClub(clubId: string, userId: string) {
	const existing = await Club.exists({ _id: clubId, organiserIds: userId });
	return !!existing;
}

export async function addUserAdminOfClub(
	clubId: string,
	userId: string,
	session?: ClientSession | null
) {
	let q = User.updateOne({ _id: userId }, { $addToSet: { adminOf: clubId } });
	if (session) {
		q = q.session(session);
	}
	return q.exec();
}

export async function removeUserAdminOfClub(
	clubId: string,
	userId: string,
	session?: ClientSession | null
) {
	let q = User.updateOne({ _id: userId }, { $pull: { adminOf: clubId } });
	if (session) {
		q = q.session(session);
	}
	return q.exec();
}

export async function addUserAsClubOrganiser(
	clubId: string,
	userId: string,
	session?: ClientSession | null
) {
	let q = Club.updateOne({ _id: clubId }, { $addToSet: { organiserIds: userId } });
	if (session) {
		q = q.session(session);
	}
	return q.exec();
}

export async function removeUserAsClubOrganiser(
	clubId: string,
	userId: string,
	session?: ClientSession | null
) {
	let q = Club.updateOne({ _id: clubId }, { $pull: { organiserIds: userId } });
	if (session) {
		q = q.session(session);
	}
	return q.exec();
}

export async function updateClubDefaultAdmin(clubId: string, userId: string) {
	return Club.updateOne({ _id: clubId }, { $set: { defaultAdminId: userId } }).exec();
}

/**
 * Inside an active transaction: verifies the target user still has adminOf for the club,
 * then sets defaultAdminId only if it still matches expectedCurrentDefaultAdminId (optimistic lock).
 */
export async function transferClubDefaultAdminIfExpected(
	clubId: string,
	newDefaultAdminUserId: string,
	expectedCurrentDefaultAdminId: string | null,
	session: ClientSession
): Promise<TransferClubDefaultAdminIfExpectedCode> {
	const targetIsAdmin = await User.exists({ _id: newDefaultAdminUserId, adminOf: clubId })
		.session(session)
		.exec();
	if (!targetIsAdmin) {
		return 'target_not_admin';
	}

	const expectedDefaultFilter =
		expectedCurrentDefaultAdminId === null
			? null
			: new mongoose.Types.ObjectId(expectedCurrentDefaultAdminId);

	const res = await Club.updateOne(
		{ _id: clubId, defaultAdminId: expectedDefaultFilter },
		{ $set: { defaultAdminId: new mongoose.Types.ObjectId(newDefaultAdminUserId) } }
	)
		.session(session)
		.exec();

	if (res.matchedCount > 0) {
		return 'ok';
	}

	const clubStillThere = await Club.exists({ _id: clubId }).session(session).exec();
	if (!clubStillThere) {
		return 'club_not_found';
	}
	return 'stale_main_admin';
}

export async function findUserById(userId: string) {
	return User.findById(userId).select('_id email name alias').lean().exec();
}
