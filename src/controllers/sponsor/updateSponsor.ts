import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import Sponsor from '../../models/Sponsor';
import Club from '../../models/Club';

/**
 * PATCH /api/clubs/:clubId/sponsors/:sponsorId
 * Update a sponsor. User must be admin of the club.
 * When club is free, only metadata (name, logoUrl, link) can be updated; status cannot be set to active.
 */
export async function updateSponsor(req: Request, res: Response) {
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

	const club = await Club.findById(clubId).select('plan').lean().exec();
	if (!club) {
		res.status(404).json({ message: 'Club not found' });
		return;
	}

	const sponsor = await Sponsor.findOne({
		_id: sponsorId,
		scope: 'club',
		clubId: new mongoose.Types.ObjectId(clubId)
	}).exec();

	if (!sponsor) {
		res.status(404).json({ message: 'Sponsor not found' });
		return;
	}

	const body = req.body as {
		name?: string;
		description?: string | null;
		logoUrl?: string | null;
		link?: string | null;
		status?: 'active' | 'paused';
	};

	if (body.name !== undefined) sponsor.name = body.name.trim();
	if (body.description !== undefined) sponsor.description = body.description?.trim() || null;
	if (body.logoUrl !== undefined) sponsor.logoUrl = body.logoUrl ?? null;
	if (body.link !== undefined) sponsor.link = body.link ?? null;

	if (body.status !== undefined) {
		if (club.plan !== 'premium' && body.status === 'active') {
			res.status(403).json({
				message: 'Cannot activate sponsors on a free plan. Upgrade to premium.'
			});
			return;
		}
		sponsor.status = body.status;
	}

	await sponsor.save();

	res.json({
		id: sponsor._id.toString(),
		name: sponsor.name,
		logoUrl: sponsor.logoUrl ?? null,
		link: sponsor.link ?? null,
		status: sponsor.status
	});
}
