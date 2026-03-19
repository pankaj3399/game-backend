import type mongoose from 'mongoose';
import Session from '../../../models/Session';
import Tournament from '../../../models/Tournament';
import User from '../../../models/User';
import UserAuth from '../../../models/UserAuth';

export async function deleteUserSessions(userId: string, session: mongoose.ClientSession) {
	await Session.deleteMany({ user: userId }).session(session);
}

export async function deleteUserAuth(userId: string, session: mongoose.ClientSession) {
	await UserAuth.deleteOne({ user: userId }).session(session);
}

export async function removeUserFromTournamentParticipants(userId: string, session: mongoose.ClientSession) {
	await Tournament.updateMany(
		{ participants: userId },
		{ $pull: { participants: userId } },
		{ session }
	);
}

export async function softDeleteUser(userId: string, session: mongoose.ClientSession) {
	const user = await User.findByIdAndUpdate(
		userId,
		{ deletedAt: new Date() },
		{ new: true }
	).session(session);

	return user;
}
