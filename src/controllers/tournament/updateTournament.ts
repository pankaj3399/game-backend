import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import Tournament from '../../models/Tournament';
import { createOrUpdateDraftSchema } from '../../validation/tournament.schemas';
import { userCanManageClub, sponsorBelongsToClub } from '../../lib/tournamentPermissions';

function toDbPayload(data: Record<string, unknown>): Record<string, unknown> {
	const payload: Record<string, unknown> = { ...data };
	if (payload.date != null && payload.date !== '') {
		if (typeof payload.date === 'string') {
			payload.date = new Date(payload.date);
		}
	} else {
		payload.date = undefined;
	}
	if (payload.club) {
		payload.club = new mongoose.Types.ObjectId(payload.club as string);
	}
	if (payload.sponsorId) {
		payload.sponsorId = new mongoose.Types.ObjectId(payload.sponsorId as string);
	} else if (payload.sponsorId === null) {
		payload.sponsorId = null;
	}
	if (Array.isArray(payload.courts)) {
		payload.courts = (payload.courts as string[]).map((cid) => new mongoose.Types.ObjectId(cid));
	}
	if (Array.isArray(payload.roundTimings)) {
		payload.roundTimings = (payload.roundTimings as { startDate?: Date | string; endDate?: Date | string }[]).map(
			(r) => ({
				startDate: r.startDate ? new Date(r.startDate) : undefined,
				endDate: r.endDate ? new Date(r.endDate) : undefined
			})
		);
	}
	delete payload.status; // Draft updates don't change status
	return payload;
}

/**
 * PATCH /api/tournaments/:id
 * Update tournament. Only draft tournaments can be updated. User must have club permission.
 */
export async function updateTournament(req: Request, res: Response) {
	const sessionUser = req.user;
	if (!sessionUser?._id) {
		res.status(401).json({ message: 'Not authenticated' });
		return;
	}

	const rawId = req.params.id;
	const id = typeof rawId === 'string' ? rawId : Array.isArray(rawId) ? rawId[0] : undefined;
	if (!id || !mongoose.Types.ObjectId.isValid(id)) {
		res.status(400).json({ message: 'Invalid tournament ID' });
		return;
	}

	const parsed = createOrUpdateDraftSchema.safeParse(req.body);
	if (!parsed.success) {
		const msg = parsed.error.issues.map((i) => i.message).join('; ');
		res.status(400).json({ message: msg, error: true, code: 'VALIDATION_ERROR', details: parsed.error.issues });
		return;
	}

	const tournament = await Tournament.findById(id).exec();
	if (!tournament) {
		res.status(404).json({ message: 'Tournament not found' });
		return;
	}

	if (tournament.status !== 'draft') {
		res.status(400).json({ message: 'Only draft tournaments can be updated. Use publish to activate.' });
		return;
	}

	const clubId = (tournament.club as mongoose.Types.ObjectId).toString();
	const ctx = {
		userId: sessionUser._id,
		userRole: sessionUser.role,
		adminOf: (sessionUser.adminOf ?? []) as mongoose.Types.ObjectId[]
	};

	const canManage = await userCanManageClub(ctx, clubId);
	if (!canManage) {
		res.status(403).json({ message: 'You do not have permission to update this tournament' });
		return;
	}

	const data = parsed.data;
	const updateClubId = data.club ?? clubId;
	if (data.sponsorId) {
		const sponsorOk = await sponsorBelongsToClub(data.sponsorId, updateClubId);
		if (!sponsorOk) {
			res.status(400).json({ message: 'Sponsor must belong to the selected club and be active' });
			return;
		}
	}

	// If changing club, verify permission for new club
	if (data.club && data.club !== clubId) {
		const canManageNew = await userCanManageClub(ctx, data.club);
		if (!canManageNew) {
			res.status(403).json({ message: 'You do not have permission to assign this tournament to that club' });
			return;
		}
	}

	const payload = toDbPayload(data);
	// Remove undefined values for partial update
	Object.keys(payload).forEach((k) => {
		if (payload[k] === undefined) delete payload[k];
	});

	Object.assign(tournament, payload);
	await tournament.save();

	res.json({
		message: 'Tournament updated',
		tournament: {
			id: tournament._id,
			name: tournament.name,
			club: tournament.club,
			status: tournament.status,
			date: tournament.date,
			updatedAt: tournament.updatedAt
		}
	});
}
