import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import Club from '../../models/Club';
import Court from '../../models/Court';

/**
 * GET /api/clubs/:clubId
 * Get club details with courts. User must be admin of this club.
 */
export async function getClubById(req: Request, res: Response) {
	const sessionUser = req.user;
	if (!sessionUser?._id) {
		res.status(401).json({ message: 'Not authenticated' });
		return;
	}

	const clubId = Array.isArray(req.params.clubId) ? req.params.clubId[0] : req.params.clubId;
	if (!clubId || !mongoose.Types.ObjectId.isValid(clubId)) {
		res.status(400).json({ message: 'Invalid club ID' });
		return;
	}

	const isAdmin = sessionUser.adminOf?.some(
		(id) => id.toString() === clubId
	);
	if (!isAdmin && sessionUser.role !== 'super_admin') {
		res.status(403).json({ message: 'You do not have permission to edit this club' });
		return;
}

	const club = await Club.findById(clubId).lean().exec();
	if (!club) {
		res.status(404).json({ message: 'Club not found' });
		return;
	}

	const courts = await Court.find({ club: clubId })
		.select('_id name type placement')
		.lean()
		.exec();

	const coords = club.coordinates?.coordinates;
	res.json({
		club: {
			id: club._id,
			name: club.name,
			address: club.address,
			website: club.website ?? null,
			bookingSystemUrl: club.bookingSystemUrl ?? null,
			coordinates: coords ? [coords[0], coords[1]] : null,
			plan: club.plan ?? 'free',
			expiresAt: club.expiresAt ?? null,
			subscriptionStatus: club.subscriptionStatus ?? 'subscribed'
		},
		courts: courts.map((c) => ({
			id: c._id,
			name: c.name,
			type: c.type,
			placement: c.placement
		}))
	});
}
