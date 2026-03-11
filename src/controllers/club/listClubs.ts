import type { Request, Response } from 'express';
import Club from '../../models/Club';

export interface ClubListItem {
	id: string;
	name: string;
	address: string;
	website: string | null;
}

/**
 * GET /api/clubs/list
 * Returns all active clubs for public display (e.g. All Clubs page).
 * No authentication required.
 */
export async function listClubs(_req: Request, res: Response) {
	const clubs = await Club.find({ status: 'active' })
		.select('_id name address website')
		.sort({ name: 1 })
		.limit(200)
		.lean()
		.exec();

	const items: ClubListItem[] = clubs.map((c) => ({
		id: (c._id as import('mongoose').Types.ObjectId).toString(),
		name: c.name,
		address: c.address,
		website: c.website ?? null
	}));

	res.json({ clubs: items });
}
