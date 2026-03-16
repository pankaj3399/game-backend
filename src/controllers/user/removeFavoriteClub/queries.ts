import User from '../../../models/User';
import type { UserDocument } from '../../../models/User';

export async function findUserById(userId: string) {
	return User.findById(userId).exec();
}

export async function saveUserFavoriteChanges(user: UserDocument) {
	await user.save();
}

