import User from '../../../models/User';

export async function updateUserProfileById(userId: string, payload: Record<string, unknown>) {
	return User.findByIdAndUpdate(userId, payload, {
		returnDocument: 'after',
		runValidators: true
	}).exec();
}
