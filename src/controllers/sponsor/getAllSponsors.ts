import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import Sponsor from '../../models/Sponsor';

export interface SponsorPublicItem {
	id: string;
	name: string;
	description: string | null;
	logoUrl: string | null;
	link: string | null;
}

/**
 * GET /api/sponsors
 * Returns all unique active sponsors across all clubs.
 * Public endpoint - no authentication required.
 * Deduplicates by (name, link) so the same sponsor added by multiple clubs appears once.
 */
export async function getAllSponsors(_req: Request, res: Response) {
	const sponsors = await Sponsor.find({ status: 'active' })
		.select('name description logoUrl link')
		.lean()
		.exec();

	// Deduplicate by (name, link) - keep first occurrence
	const seen = new Set<string>();
	const unique: SponsorPublicItem[] = [];

	for (const s of sponsors) {
		const key = `${s.name}|${s.link ?? ''}`;
		if (seen.has(key)) continue;
		seen.add(key);
		unique.push({
			id: (s._id as mongoose.Types.ObjectId).toString(),
			name: s.name,
			description: s.description ?? null,
			logoUrl: s.logoUrl ?? null,
			link: s.link ?? null
		});
	}

	res.json({ sponsors: unique });
}
