import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import Tournament from '../../models/Tournament';
import Club from '../../models/Club';
import { escapeRegex } from '../../lib/validation';
import { hasRoleOrAbove } from '../../constants/roles';
import { ROLES } from '../../constants/roles';
import { getTournamentQuerySchema } from '../../validation/tournament.schemas';
import { TournamentListDoc } from './types';

/**
 * GET /api/tournaments
 * - Players: list published tournaments only (active, inactive).
 * - Organisers+: list tournaments for clubs they manage; supports view=published|drafts.
 * Query: page, limit, status, clubId, q (search), view (published|drafts, organiser only)
 */
export async function getTournaments(req: Request, res: Response) {
	const sessionUser = req.user;
	if (!sessionUser?._id) {
		res.status(401).json({ message: 'Not authenticated' });
		return;
	}


	const query = getTournamentQuerySchema.safeParse(req.query);
	if (!query.success) {
		res.status(400).json({ message: query.error.message });
		return;
	}

	const page = query.data.page;
	const limit = query.data.limit;
	const status = query.data.status;
	const clubId = query.data.clubId;
	const q = query.data.q;
	const view = query.data.view; // 'published' | 'drafts' (organiser only)

	const skip = (page - 1) * limit;
	const isOrganiserOrAbove = hasRoleOrAbove(sessionUser.role, ROLES.ORGANISER);
	const isSuperAdmin = sessionUser.role === ROLES.SUPER_ADMIN;

	// Get clubs user can manage (admin or organiser) - only used for non-super-admin organisers
	let manageableClubIds: mongoose.Types.ObjectId[] = [];
	if (isOrganiserOrAbove && !isSuperAdmin) {
		const adminClubs = (sessionUser.adminOf ?? []) as mongoose.Types.ObjectId[];
		const organiserClubs = await Club.find({
			organiserIds: sessionUser._id,
			status: 'active'
		})
			.select('_id')
			.lean()
			.exec();
		const organiserClubIds = organiserClubs.map((c) => c._id);
		manageableClubIds = Array.from(new Set([...adminClubs, ...organiserClubIds].map(String))).map((id) =>
			new mongoose.Types.ObjectId(id)
		);
	}

	const filter: Record<string, unknown> = {};

	if (isSuperAdmin) {
		// Super admin: no club restrictions, but can use view/status filters
		if (view === 'drafts') {
			filter.status = 'draft';
		} else {
			filter.status = status && ['active', 'inactive'].includes(status)
				? status
				: { $in: ['active', 'inactive'] };
		}
	} else if (isOrganiserOrAbove) {
		// Organiser: filter by manageable clubs
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
			filter.club = new mongoose.Types.ObjectId(clubId);
		} else {
			if (manageableClubIds.length === 0) {
				return res.json({
					tournaments: [],
					pagination: { total: 0, page: 1, limit, totalPages: 0 }
				});
			}
			filter.club = { $in: manageableClubIds };
		}

		// View param: published = active+inactive, drafts = draft only
		if (view === 'drafts') {
			filter.status = 'draft';
		} else {
			// published tab or default
			filter.status = status && ['active', 'inactive'].includes(status)
				? status
				: { $in: ['active', 'inactive'] };
		}
	} else {
		// Player: only published tournaments from all clubs
		filter.status =
			status && ['active', 'inactive'].includes(status) ? status : { $in: ['active', 'inactive'] };
		if (clubId) {
			if (!mongoose.Types.ObjectId.isValid(clubId)) {
				res.status(400).json({ message: 'Invalid club ID' });
				return;
			}
			filter.club = new mongoose.Types.ObjectId(clubId);
		}
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
			.lean<TournamentListDoc[]>()
			.exec(),
		Tournament.countDocuments(filter)
	]);

	const items = tournaments.map((t) => ({
		id: t._id,
		name: t.name,
		club: t.club ? { id: t.club._id, name: t.club.name } : null,
		date: t.date ? new Date(t.date).toISOString() : null,
		status: t.status,
		sponsor:
			t.sponsorId
				? {
						id: String(t.sponsorId._id),
						name: t.sponsorId.name,
						logoUrl: t.sponsorId.logoUrl,
						link: t.sponsorId.link
					}
				: null
	}));

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
