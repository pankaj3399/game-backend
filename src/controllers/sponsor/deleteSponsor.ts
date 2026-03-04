import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import Sponsor from '../../models/Sponsor';

/**
 * DELETE /api/clubs/:clubId/sponsors/:sponsorId
 * Remove a sponsor. User must be admin of the club.
 */
export async function deleteSponsor(req: Request, res: Response) {
	const sessionUser = req.user;
	if (!sessionUser?._id) {
		res.status(401).json({ message: 'Not authenticated' });
		return;
	}

	const clubId = Array.isArray(req.params.clubId) ? req.params.clubId[0] : req.params.clubId;
	const sponsorId = Array.isArray(req.params.sponsorId) ? req.params.sponsorId[0] : req.params.sponsorId;

	if (!clubId || !mongoose.Types.ObjectId.isValid(clubId)) {
		res.status(400).json({ message: 'Invalid club ID' });
		return;
	}
	if (!sponsorId || !mongoose.Types.ObjectId.isValid(sponsorId)) {
		res.status(400).json({ message: 'Invalid sponsor ID' });
		return;
	}

	const isAdmin = sessionUser.adminOf?.some((id) => id.toString() === clubId);
	if (!isAdmin && sessionUser.role !== 'super_admin') {
		res.status(403).json({ message: 'You do not have permission to manage this club' });
		return;
	}

	const result = await Sponsor.deleteOne({
		_id: sponsorId,
		scope: 'club',
		clubId: new mongoose.Types.ObjectId(clubId)
	});

	if (result.deletedCount === 0) {
		res.status(404).json({ message: 'Sponsor not found' });
		return;
	}

	res.status(204).send();
}
