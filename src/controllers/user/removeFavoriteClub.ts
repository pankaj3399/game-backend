import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import User from '../../models/User';

/** Requires authenticate middleware. */
export async function removeFavoriteClub(req: Request, res: Response) {
	const sessionUser = req.user;
	if (!sessionUser?._id) {
		res.status(401).json({ message: 'Not authenticated' });
		return;
	}

	const clubId = req.params.clubId as string;
	if (!clubId || !mongoose.Types.ObjectId.isValid(clubId)) {
		res.status(400).json({ message: 'Invalid club ID' });
		return;
	}

	const user = await User.findById(sessionUser._id);
	if (!user) {
		res.status(404).json({ message: 'User not found' });
		return;
	}

	const clubObjId = new mongoose.Types.ObjectId(clubId);
	user.favoriteClubs = user.favoriteClubs.filter((id) => !id.equals(clubObjId));

	// If removing home club, clear it
	if (user.homeClub?.equals(clubObjId)) {
		user.homeClub = null;
	}

	await user.save();

	res.json({ message: 'Club removed from favorites' });
}
