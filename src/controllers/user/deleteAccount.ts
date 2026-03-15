import { type Request, type Response } from 'express';
import mongoose from 'mongoose';
import User from '../../models/User';
import Session from '../../models/Session';
import UserAuth from '../../models/UserAuth';
import Tournament from '../../models/Tournament';

/** Requires authenticate middleware - req.user is guaranteed. Deletes the authenticated user's account and all related data. */
export async function deleteAccount(req: Request, res: Response) {
	const sessionUser = req.user;
	if (!sessionUser?._id) {
		res.status(401).json({ message: 'Not authenticated' });
		return;
	}

	const userId = sessionUser._id;

	try {
		await mongoose.connection.startSession().then(async (session) => {
			try {
				await session.withTransaction(async () => {
					// 1. Delete all sessions for this user
					await Session.deleteMany({ user: userId }).session(session);

					// 2. Delete UserAuth (OAuth credentials)
					await UserAuth.deleteOne({ user: userId }).session(session);

					// 3. Remove user from tournament participants
					await Tournament.updateMany(
						{ participants: userId },
						{ $pull: { participants: userId } },
						{ session }
					);

					// 4. Soft-delete the user (set deletedAt)
					const result = await User.findByIdAndUpdate(
						userId,
						{ deletedAt: new Date() },
						{ new: true }
					).session(session);
					if (!result) {
						throw new Error('User not found');
					}
				});
			} finally {
				await session.endSession();
			}
		});

		res.json({ message: 'Account deleted successfully' });
	} catch (err) {
		res.status(500).json({
			message: 'Failed to delete account',
			error: true,
			code: 'DELETE_ACCOUNT_FAILED',
		});
	}
}
