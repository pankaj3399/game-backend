import Club from '../../../models/Club';
import User from '../../../models/User';

export async function findClubStaffSnapshotById(clubId: string) {
	return Club.findById(clubId).select('defaultAdminId organiserIds').lean().exec();
}

export async function findClubStaffUserSnapshotById(userId: string) {
	return User.findById(userId).select('_id email name alias adminOf').lean().exec();
}

export async function isUserAdminOfClub(clubId: string, userId: string) {
	const existing = await User.exists({ _id: userId, adminOf: clubId });
	return !!existing;
}

export async function isUserOrganiserOfClub(clubId: string, userId: string) {
	const existing = await Club.exists({ _id: clubId, organiserIds: userId });
	return !!existing;
}

export async function addUserAdminOfClub(userId: string, clubId: string) {
	return User.updateOne({ _id: userId }, { $addToSet: { adminOf: clubId } }).exec();
}

export async function removeUserAdminOfClub(userId: string, clubId: string) {
	return User.updateOne({ _id: userId }, { $pull: { adminOf: clubId } }).exec();
}

export async function addUserAsClubOrganiser(clubId: string, userId: string) {
	return Club.updateOne({ _id: clubId }, { $addToSet: { organiserIds: userId } }).exec();
}

export async function removeUserAsClubOrganiser(clubId: string, userId: string) {
	return Club.updateOne({ _id: clubId }, { $pull: { organiserIds: userId } }).exec();
}

export async function updateClubDefaultAdmin(clubId: string, userId: string) {
	return Club.updateOne({ _id: clubId }, { $set: { defaultAdminId: userId } }).exec();
}

export async function findUserById(userId: string) {
	return User.findById(userId).select('_id email name alias').exec();
}
