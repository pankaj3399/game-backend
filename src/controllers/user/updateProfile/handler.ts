import type { UpdateProfileInput } from '../../../validation/user.schemas';
import { error, ok } from '../../../shared/helpers';
import { buildProfileUpdatePayload } from './payload';
import { updateUserProfileById } from './queries';
import { logger } from '../../../lib/logger';

export async function updateProfileFlow(userId: string, input: UpdateProfileInput) {

	try{

	const updatePayload = buildProfileUpdatePayload(input);
	const user = await updateUserProfileById(userId, updatePayload);

	if (!user) {
		return error(404, 'User not found');
	}

	return ok(
		{},
		{ status: 200, message: 'Profile updated successfully' }
	);
} catch (err) {
		logger.error('Error updating profile', { err });
		return error(500, 'Failed to update profile');
	}
}
