import type mongoose from 'mongoose';
import Club from '../../../models/Club';
import Court from '../../../models/Court';
import User from '../../../models/User';

export async function findClubByName(name: string) {
	return Club.findOne({ name }).select('_id').lean().exec();
}

export async function createClubWithSession(
	payload: {
		name: string;
		address: string;
		website: string | null;
		bookingSystemUrl: string | null;
		coordinates: { type: 'Point'; coordinates: [number, number] };
		defaultAdminId: string;
		plan: 'free';
		expiresAt: null;
	},
	session: mongoose.ClientSession
) {
	const [club] = await Club.create([payload], { session });
	return club;
}

export async function insertCourtsWithSession(
	courts: Array<{
		club: unknown;
		name: string;
		type: 'concrete' | 'clay' | 'hard' | 'grass' | 'carpet' | 'other';
		placement: 'indoor' | 'outdoor';
	}>,
	session: mongoose.ClientSession
) {
	if (courts.length === 0) {
		return;
	}

	await Court.insertMany(courts, { session });
}

export async function findUserByIdWithSession(userId: string, session: mongoose.ClientSession) {
	return User.findById(userId).session(session).exec();
}
