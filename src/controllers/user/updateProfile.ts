import { type Request, type Response } from 'express';
import User from '../../models/User';

/** Requires authenticate middleware - req.user is guaranteed. Body validated by validateBody(updateProfileSchema). */
export async function updateProfile(req: Request, res: Response) {
	const sessionUser = req.user;
	if (!sessionUser?._id) {
		res.status(401).json({ message: 'Not authenticated' });
		return;
	}

	const data = req.body as {
		alias?: string;
		name?: string;
		dateOfBirth?: Date | null;
		gender?: 'male' | 'female' | 'other' | null;
	};

	const updatePayload: Record<string, unknown> = {};
	if (data.name !== undefined) updatePayload.name = data.name.trim() || null;
	if (data.alias !== undefined) updatePayload.alias = data.alias.trim() || null;
	if (data.dateOfBirth !== undefined) updatePayload.dateOfBirth = data.dateOfBirth;
	if (data.gender !== undefined) updatePayload.gender = data.gender;

	try {
		const user = await User.findByIdAndUpdate(
			sessionUser._id,
			updatePayload,
			{ new: true, runValidators: true }
		);

		if (!user) {
			return res.status(404).json({ message: 'User not found', error: true, code: 'USER_NOT_FOUND' });
		}

		res.json({ message: 'Profile updated successfully' });
	} catch (err) {
		res.status(500).json({ message: 'Failed to update profile', error: true, code: 'UPDATE_FAILED' });
	}
}
