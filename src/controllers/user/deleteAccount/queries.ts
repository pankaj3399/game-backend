import type mongoose from 'mongoose';
import Session from '../../../models/Session';
import Tournament from '../../../models/Tournament';
import User from '../../../models/User';
import UserAuth from '../../../models/UserAuth';

function buildDeletedValue(value: string | null | undefined, deletionSuffix: string) {
	if (!value) return value;
	return `deleted-${deletionSuffix}-${value}`;
}

export async function deleteUserSessions(userId: string, session: mongoose.ClientSession) {
	await Session.deleteMany({ user: userId }).session(session);
}

export async function removeUserFromTournamentParticipants(userId: string, session: mongoose.ClientSession) {
	await Tournament.updateMany(
		{ participants: userId },
		{ $pull: { participants: userId } },
		{ session }
	);
}

export async function softDeleteUser(userId: string, session: mongoose.ClientSession) {
	const user = await User.findById(userId).setOptions({ includeDeleted: true }).session(session);

	if (!user) {
		return null;
	}

	if (user.deletedAt) {
		return user;
	}

	const deletionSuffix = Date.now().toString();

	const updatedUser = await User.findByIdAndUpdate(
		userId,
		{
			email: buildDeletedValue(user.email, deletionSuffix),
			alias: buildDeletedValue(user.alias, deletionSuffix),
			name: buildDeletedValue(user.name, deletionSuffix),
			deletedAt: new Date(),
			status: 'inactive'
		},
		{ new: true, session }
	);

	await UserAuth.findOneAndUpdate(
		{ user: user._id },
		[
			{
				$set: {
					googleId: {
						$cond: [
							{
								$and: [
									{ $ne: [{ $ifNull: ['$googleId', null] }, null] },
									{ $ne: [{ $ifNull: ['$googleId', ''] }, ''] }
								]
							},
							{ $concat: ['deleted-', deletionSuffix, '-', '$googleId'] },
							'$googleId'
						]
					},
					appleId: {
						$cond: [
							{
								$and: [
									{ $ne: [{ $ifNull: ['$appleId', null] }, null] },
									{ $ne: [{ $ifNull: ['$appleId', ''] }, ''] }
								]
							},
							{ $concat: ['deleted-', deletionSuffix, '-', '$appleId'] },
							'$appleId'
						]
					}
				}
			}
		],
		{ session }
	);

	return updatedUser;
}
