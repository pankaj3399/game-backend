import type { Request, Response } from 'express';
import Club from '../../models/Club';
import { escapeRegex } from '../../lib/validation';

/**
 * GET /api/clubs?q=searchTerm
 * Search clubs by name (case-insensitive). Returns active clubs only.
 */
export async function searchClubs(req: Request, res: Response) {
	const q = (req.query.q as string)?.trim() ?? '';

	if (!q) {
		res.json({ clubs: [] });
		return;
	}

	const clubs = await Club.find({
		status: 'active',
		name: { $regex: escapeRegex(q), $options: 'i' }
	})
		.select('_id name')
		.limit(20)
		.lean()
		.exec();

	res.json({
		clubs: clubs.map((c) => ({ id: c._id, name: c.name }))
	});
}
