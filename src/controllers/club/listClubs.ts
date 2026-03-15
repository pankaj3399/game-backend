import type { Request, Response } from 'express';
import Club from '../../models/Club';
import { logger } from '../../lib/logger';

export interface ClubListItem {
	id: string;
	name: string;
	address: string;
	website: string | null;
}

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/**
 * GET /api/clubs/list
 * Returns active clubs for public display (e.g. All Clubs page).
 * Supports pagination via ?page=&limit= query parameters.
 * No authentication required.
 */
export async function listClubs(req: Request, res: Response): Promise<void> {
	try {
		const rawPage = Array.isArray(req.query.page) ? req.query.page[0] : req.query.page;
		const rawLimit = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;

		let page = rawPage !== undefined ? parseInt(String(rawPage), 10) : DEFAULT_PAGE;
		let limit = rawLimit !== undefined ? parseInt(String(rawLimit), 10) : DEFAULT_LIMIT;

		if (!Number.isFinite(page) || page <= 0) {
			page = DEFAULT_PAGE;
		}

		if (!Number.isFinite(limit) || limit <= 0) {
			limit = DEFAULT_LIMIT;
		}

		if (limit > MAX_LIMIT) {
			limit = MAX_LIMIT;
		}

		const skip = (page - 1) * limit;

		const [totalCount, clubs] = await Promise.all([
			Club.countDocuments({ status: 'active' }).exec(),
			Club.find({ status: 'active' })
				.select('_id name address website')
				.sort({ name: 1 })
				.skip(skip)
				.limit(limit)
				.lean()
				.exec()
		]);

		const items: ClubListItem[] = clubs.map((c) => ({
			id: (c._id as import('mongoose').Types.ObjectId).toString(),
			name: c.name,
			address: c.address,
			website: c.website ?? null
		}));

		const totalPages = Math.max(1, Math.ceil(totalCount / limit));

		res.json({
			clubs: items,
			pagination: {
				page,
				limit,
				totalCount,
				totalPages
			}
		});
	} catch (err: unknown) {
		res.status(500).json({ message: 'Internal server error' });
		logger.error(err);
	}
}
