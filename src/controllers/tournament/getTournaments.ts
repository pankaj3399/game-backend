import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import Tournament from '../../models/Tournament';
import Club from '../../models/Club';
import { escapeRegex } from '../../lib/validation';

/**
 * GET /api/tournaments
 * List tournaments for clubs the user can manage.
 * Query: page, limit, status, clubId, q (search)
 */
export async function getTournaments(req: Request, res: Response) {
	const sessionUser = req.user;
	if (!sessionUser?._id) {
		res.status(401).json({ message: 'Not authenticated' });
		return;
	}

	const page = Math.max(1, parseInt(String(req.query.page), 10) || 1);
	const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit), 10) || 10));
	const status = req.query.status as string | undefined;
	const clubId = req.query.clubId as string | undefined;
	const q = req.query.q as string | undefined;

	const skip = (page - 1) * limit;

	// Get clubs user can manage (admin or organiser)
	const adminClubs = (sessionUser.adminOf ?? []) as mongoose.Types.ObjectId[];
	const organiserClubs = await Club.find({
		organiserIds: sessionUser._id,
		status: 'active'
	})
		.select('_id')
		.lean()
		.exec();
	const organiserClubIds = organiserClubs.map((c) => c._id);
	const manageableClubIds = [
		...new Set([...adminClubs.map((id) => id.toString()), ...organiserClubIds.map((id) => id.toString())])
	].map((id) => new mongoose.Types.ObjectId(id));

	// If clubId filter provided, ensure user can manage it
	if (clubId) {
		if (!mongoose.Types.ObjectId.isValid(clubId)) {
			res.status(400).json({ message: 'Invalid club ID' });
			return;
		}
		const inManageable = manageableClubIds.some((id) => id.toString() === clubId);
		if (!inManageable) {
			res.status(403).json({ message: 'You do not have permission to view tournaments for this club' });
			return;
		}
	}

	if (manageableClubIds.length === 0 && !clubId) {
		return res.json({
			tournaments: [],
			pagination: { total: 0, page: 1, limit, totalPages: 0 }
		});
	}

	const filter: Record<string, unknown> = {
		club: clubId ? new mongoose.Types.ObjectId(clubId) : { $in: manageableClubIds }
	};

	if (status && ['active', 'draft', 'inactive'].includes(status)) {
		filter.status = status;
	}

	if (q && q.trim()) {
		filter.name = { $regex: escapeRegex(q.trim()), $options: 'i' };
	}

	const [tournaments, total] = await Promise.all([
		Tournament.find(filter)
			.populate('club', 'name')
			.populate('sponsorId', 'name logoUrl link')
			.sort({ date: -1, createdAt: -1 })
			.skip(skip)
			.limit(limit)
			.lean()
			.exec(),
		Tournament.countDocuments(filter)
	]);

	const items = tournaments.map((t) => {
		const clubObj = t.club && typeof t.club === 'object' ? (t.club as { _id?: unknown; name?: string }) : null;
		return {
			id: t._id,
			name: t.name,
			club: clubObj ? { id: clubObj._id, name: clubObj.name } : null,
			date: t.date ? (t.date as Date).toISOString?.() ?? String(t.date) : null,
			status: t.status,
			sponsorId: t.sponsorId
		};
	});

	res.json({
		tournaments: items,
		pagination: {
			total,
			page,
			limit,
			totalPages: Math.ceil(total / limit)
		}
	});
}
