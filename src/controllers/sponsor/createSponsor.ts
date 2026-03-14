import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import Sponsor from '../../models/Sponsor';
import Club from '../../models/Club';
import { createSponsorSchema } from '../../validation/sponsor.schemas';
import { logger } from '../../lib/logger';

/**
 * POST /api/clubs/:clubId/sponsors
 * Create a sponsor for a club. Club must be on premium plan.
 * User must be admin of this club.
 */
export async function createSponsor(req: Request, res: Response) {
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

	const club = await Club.findById(clubId).select('plan').lean().exec();
	if (!club) {
		res.status(404).json({ message: 'Club not found' });
		return;
	}

	if (club.plan !== 'premium') {
		res.status(403).json({
			message: 'Sponsors require a premium plan. Upgrade your club to add sponsors.'
		});
		return;
	}

	const parsed = createSponsorSchema.safeParse(req.body);
	if (!parsed.success) {
		res.status(400).json({
			message: 'Invalid request body',
		});
		logger.error('Invalid request body', { body: req.body, errors: parsed.error.issues });	
		return;
	}

	const body = parsed.data;
	const name = body.name.trim();
	const description = body.description?.trim() || null;
	const logoUrl = body.logoUrl ?? null;
	const link = body.link ?? null;

	const sponsor = await Sponsor.create({
		name,
		description,
		logoUrl,
		link,
		scope: 'club',
		clubId: new mongoose.Types.ObjectId(clubId),
		status: 'active'
	});

	res.status(201).json({
		id: sponsor._id.toString(),
		name: sponsor.name,
		description: sponsor.description ?? null,
		logoUrl: sponsor.logoUrl ?? null,
		link: sponsor.link ?? null,
		status: sponsor.status
	});
}
