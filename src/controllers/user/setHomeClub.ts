import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import User from '../../models/User';

/** Requires authenticate middleware. */
export async function setHomeClub(req: Request, res: Response) {
	const sessionUser = req.user;
	if (!sessionUser?._id) {
		res.status(401).json({ message: 'Not authenticated' });
		return;
	}

	const { clubId } = req.body as { clubId: string };
	if (!clubId || !mongoose.Types.ObjectId.isValid(clubId)) {
		res.status(400).json({ message: 'Invalid club ID' });
		return;
	}

	const clubObjId = new mongoose.Types.ObjectId(clubId);
	const updated = await User.findOneAndUpdate(
		{ _id: sessionUser._id, favoriteClubs: clubObjId },
		{ $set: { homeClub: clubObjId } },
		{ new: true }
	);

	if (!updated) {
		const userExists = await User.findById(sessionUser._id);
		if (!userExists) {
			res.status(404).json({ message: 'User not found' });
			return;
		}
		res.status(400).json({ message: 'Club must be in favorites to set as home club' });
		return;
	}

	res.json({ message: 'Home club updated' });
}
