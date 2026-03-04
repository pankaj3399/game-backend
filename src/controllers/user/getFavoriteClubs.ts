import type { Request, Response } from 'express';
import User from '../../models/User';

/** Requires authenticate middleware. Returns favorite clubs and home club. */
export async function getFavoriteClubs(req: Request, res: Response) {
	const sessionUser = req.user;
	if (!sessionUser?._id) {
		res.status(401).json({ message: 'Not authenticated' });
		return;
	}

	const user = await User.findById(sessionUser._id)
		.populate('favoriteClubs', '_id name')
		.populate('homeClub', '_id name')
		.select('favoriteClubs homeClub')
		.lean()
		.exec();

	if (!user) {
		res.status(404).json({ message: 'User not found' });
		return;
	}

	const favClubsRaw = user.favoriteClubs as { _id: unknown; name?: string }[] | undefined;
	const favoriteClubs = (Array.isArray(favClubsRaw) ? favClubsRaw : [])
		.filter((c) => c && typeof c === 'object' && c.name != null)
		.map((c) => ({ id: c._id, name: c.name as string }));

	const homeClubRaw = user.homeClub as { _id: unknown; name?: string } | null | undefined;
	const homeClub =
		homeClubRaw && typeof homeClubRaw === 'object' && homeClubRaw.name != null
			? { id: homeClubRaw._id, name: homeClubRaw.name }
			: null;

	res.json({ favoriteClubs, homeClub });
}
