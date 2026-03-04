import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import Sponsor from '../../models/Sponsor';
import Club from '../../models/Club';

export interface SponsorResponse {
	id: string;
	name: string;
	logoUrl: string | null;
	link: string | null;
	status: 'active' | 'paused';
}

/**
 * GET /api/clubs/:clubId/sponsors
 * Returns sponsors for a club. User must be admin of this club.
 * When club plan is free, all sponsors are returned with effective status 'paused'.
 */
export async function getClubSponsors(req: Request, res: Response) {
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

	const isAdmin = sessionUser.adminOf?.some((id) => id.toString() === clubId);
	if (!isAdmin && sessionUser.role !== 'super_admin') {
		res.status(403).json({ message: 'You do not have permission to manage this club' });
		return;
	}

	const club = await Club.findById(clubId)
		.select('plan')
		.lean()
		.exec();
	if (!club) {
		res.status(404).json({ message: 'Club not found' });
		return;
	}

	const sponsors = await Sponsor.find({
		scope: 'club',
		clubId: new mongoose.Types.ObjectId(clubId)
	})
		.lean()
		.exec();

	const isPremium = club.plan === 'premium';
	const sponsorsResponse: SponsorResponse[] = sponsors.map((s) => ({
		id: s._id.toString(),
		name: s.name,
		logoUrl: s.logoUrl ?? null,
		link: s.link ?? null,
		status: isPremium ? (s.status as 'active' | 'paused') : 'paused'
	}));

	res.json({
		sponsors: sponsorsResponse,
		subscription: {
			plan: club.plan ?? 'free',
			canManageSponsors: isPremium
		}
	});
}
