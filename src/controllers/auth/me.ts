import type { Request, Response } from 'express';
import User from '../../models/User';

/** Requires authenticate middleware - req.user is guaranteed. Returns basic user info only. */
export async function getMe(req: Request, res: Response) {
	const sessionUser = req.user;
	if (!sessionUser?._id) {
		res.status(401).json({ message: 'Not authenticated' });
		return;
	}

	const user = await User.findById(sessionUser._id)
		.select('_id email name alias dateOfBirth gender role')
		.lean()
		.exec();

	if (!user) {
		res.status(404).json({ message: 'User not found' });
		return;
	}

	res.json({
		user: {
			id: user._id,
			email: user.email,
			name: user.name,
			alias: user.alias,
			dateOfBirth: user.dateOfBirth,
			gender: user.gender,
			role: user.role
		}
	});
}
