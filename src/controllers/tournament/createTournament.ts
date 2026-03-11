import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import Tournament from '../../models/Tournament';
import { createOrUpdateDraftSchema, publishSchema } from '../../validation/tournament.schemas';
import { userCanManageClub, sponsorBelongsToClub } from '../../lib/tournamentPermissions';

function toDbPayload(data: Record<string, unknown>): Record<string, unknown> {
	const payload: Record<string, unknown> = { ...data };
	if (payload.date != null && payload.date !== '') {
		if (typeof payload.date === 'string') {
			payload.date = new Date(payload.date);
		}
	} else {
		delete payload.date;
	}
	if (payload.club) {
		payload.club = new mongoose.Types.ObjectId(payload.club as string);
	}
	if (payload.sponsorId) {
		payload.sponsorId = new mongoose.Types.ObjectId(payload.sponsorId as string);
	} else {
		delete payload.sponsorId;
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
	delete payload.status; // We set it explicitly
	return payload;
}

/**
 * POST /api/tournaments
 * Create tournament as draft or publish. Body must include status: 'draft' | 'active'.
 */
export async function createTournament(req: Request, res: Response) {
	const sessionUser = req.user;
	if (!sessionUser?._id) {
		res.status(401).json({ message: 'Not authenticated' });
		return;
	}

	const rawBody = req.body as Record<string, unknown>;
	const status = rawBody.status as string | undefined;

	if (!status || !['draft', 'active'].includes(status)) {
		res.status(400).json({ message: 'status must be "draft" or "active"' });
		return;
	}

	const schema = status === 'draft' ? createOrUpdateDraftSchema : publishSchema;
	const parsed = schema.safeParse(rawBody);
	if (!parsed.success) {
		const msg = parsed.error.issues.map((i) => i.message).join('; ');
		res.status(400).json({ message: msg, error: true, code: 'VALIDATION_ERROR', details: parsed.error.issues });
		return;
	}

	const data = parsed.data;

	// Required for both: club and name
	const clubId = data.club ?? (data as { club?: string }).club;
	if (!clubId) {
		res.status(400).json({ message: 'Club is required' });
		return;
	}

	const name = data.name ?? (data as { name?: string }).name;
	if (!name || !String(name).trim()) {
		res.status(400).json({ message: 'Tournament name is required' });
		return;
	}

	const ctx = {
		userId: sessionUser._id,
		userRole: sessionUser.role,
		adminOf: (sessionUser.adminOf ?? []) as mongoose.Types.ObjectId[]
	};

	const canManage = await userCanManageClub(ctx, clubId);
	if (!canManage) {
		res.status(403).json({ message: 'You do not have permission to create tournaments for this club' });
		return;
	}

	if (data.sponsorId) {
		const sponsorOk = await sponsorBelongsToClub(data.sponsorId, clubId);
		if (!sponsorOk) {
			res.status(400).json({ message: 'Sponsor must belong to the selected club and be active' });
			return;
		}
	}

	const payload = toDbPayload({ ...data, status });
	payload.club = new mongoose.Types.ObjectId(clubId);
	payload.status = status;

	try {
		const doc = await Tournament.create([payload]);
		const tournament = doc[0];
		res.status(201).json({
			message: status === 'draft' ? 'Draft saved' : 'Tournament published',
			tournament: {
				id: tournament._id,
				name: tournament.name,
				club: tournament.club,
				status: tournament.status,
				date: tournament.date,
				createdAt: tournament.createdAt
			}
		});
	} catch (err) {
		const mongoErr = err as { code?: number; message?: string };
		if (mongoErr.code === 11000) {
			res.status(400).json({ message: 'A tournament with this name already exists', error: true });
			return;
		}
		res.status(500).json({ message: mongoErr.message ?? 'Failed to create tournament', error: true });
	}
}
