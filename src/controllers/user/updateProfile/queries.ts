import User from '../../../models/User';

export async function updateUserProfileById(userId: string, payload: Record<string, unknown>) {
	return User.findByIdAndUpdate(userId, payload, {
		new: true,
		runValidators: true
	}).exec();
}
