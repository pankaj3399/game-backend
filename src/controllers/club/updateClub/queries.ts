import type mongoose from 'mongoose';
import Club from '../../../models/Club';
import Court from '../../../models/Court';

export async function findClubByIdForUpdate(clubId: string) {
	return Club.findById(clubId).exec();
}

export async function findCanonicalCourtIdsForClub(
	suppliedCourtIds: string[],
	clubId: string,
	session: mongoose.ClientSession
) {
	if (suppliedCourtIds.length === 0) {
		return [];
	}

	const docs = await Court.find({ _id: { $in: suppliedCourtIds }, club: clubId }, { _id: 1 })
		.session(session)
		.lean()
		.exec();

	return docs.map((doc) => doc._id.toString());
}

export async function deleteRemovedClubCourts(clubId: string, canonicalCourtIds: string[], session: mongoose.ClientSession) {
	await Court.deleteMany(
		{
			club: clubId,
			_id: { $nin: canonicalCourtIds }
		},
		{ session }
	);
}

export async function updateExistingCourt(
	courtId: string,
	clubId: string,
	courtData: { name: string; type: 'concrete' | 'clay' | 'hard' | 'grass' | 'carpet' | 'other'; placement: 'indoor' | 'outdoor' },
	session: mongoose.ClientSession
) {
	await Court.findOneAndUpdate({ _id: courtId, club: clubId }, { $set: courtData }, { session }).exec();
}

export async function createNewCourt(
	clubId: string,
	courtData: { name: string; type: 'concrete' | 'clay' | 'hard' | 'grass' | 'carpet' | 'other'; placement: 'indoor' | 'outdoor' },
	session: mongoose.ClientSession
) {
	await Court.create([{ club: clubId, ...courtData }], { session });
}

export async function countClubCourts(clubId: string) {
	return Court.countDocuments({ club: clubId }).exec();
}
