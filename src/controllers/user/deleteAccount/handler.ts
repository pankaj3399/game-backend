import mongoose from 'mongoose';
import { error, ok } from '../../../shared/helpers';
import {
	deleteUserAuth,
	deleteUserSessions,
	removeUserFromTournamentParticipants,
	softDeleteUser
} from './queries';
import { logger } from '../../../lib/logger';

const USER_NOT_FOUND = 'USER_NOT_FOUND';

export async function deleteAccountFlow(userId: string) {
	try{

		const session = await mongoose.startSession();
		
		try {
			await session.withTransaction(async () => {
				await deleteUserSessions(userId, session);
				await deleteUserAuth(userId, session);
				await removeUserFromTournamentParticipants(userId, session);
				
				const result = await softDeleteUser(userId, session);
				
				if (!result) {
					throw new Error(USER_NOT_FOUND);
				}
			});
		} catch (err) {
			if (err instanceof Error && err.message === USER_NOT_FOUND) {
				return error(404, 'User not found');
			}
			throw err;
		} finally {
			await session.endSession();
		}

	return ok(
		{},
		{ status: 200, message: 'Account deleted successfully' }
	);
} catch (err) {
		logger.error('Error deleting account', { err });
		return error(500, 'Failed to delete account');
	}
}
