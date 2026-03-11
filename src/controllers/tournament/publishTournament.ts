import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import Tournament from '../../models/Tournament';
import { publishSchema } from '../../validation/tournament.schemas';
import { userCanManageClub, sponsorBelongsToClub } from '../../lib/tournamentPermissions';

function toDbPayload(data: Record<string, unknown>): Record<string, unknown> {
	const payload: Record<string, unknown> = { ...data };
	if (payload.date != null && payload.date !== '') {
		if (typeof payload.date === 'string') {
			payload.date = new Date(payload.date);
		}
	}
	if (payload.club) {
		payload.club = new mongoose.Types.ObjectId(payload.club as string);
	}
	if (payload.sponsorId) {
		payload.sponsorId = new mongoose.Types.ObjectId(payload.sponsorId as string);
	} else {
		payload.sponsorId = undefined;
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
	payload.status = 'active';
	return payload;
}

/**
 * POST /api/tournaments/:id/publish
 * Publish a draft tournament. Body must contain full publish-valid payload (merge with existing).
 * Idempotent if already active.
 */
export async function publishTournament(req: Request, res: Response) {
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

	const tournament = await Tournament.findById(id as string).lean().exec();
	if (!tournament) {
		res.status(404).json({ message: 'Tournament not found' });
		return;
	}

	if (tournament.status === 'active') {
		res.json({
			message: 'Tournament is already published',
			tournament: {
				id: tournament._id,
				name: tournament.name,
				status: tournament.status
			}
		});
		return;
	}

	if (tournament.status !== 'draft') {
		res.status(400).json({ message: 'Only draft tournaments can be published' });
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
		res.status(403).json({ message: 'You do not have permission to publish this tournament' });
		return;
	}

	// Merge existing tournament with body for validation
	const merged = {
		...tournament,
		...req.body,
		club: clubId,
		_id: undefined,
		createdAt: undefined,
		updatedAt: undefined,
		participants: undefined,
		dropouts: undefined,
		schedule: undefined
	};

	// Ensure we have required fields from existing doc if not in body
	if (!merged.name) merged.name = tournament.name;
	if (merged.memberFee == null) merged.memberFee = tournament.memberFee ?? 0;
	if (merged.externalFee == null) merged.externalFee = tournament.externalFee ?? 0;
	if (merged.minMember == null) merged.minMember = tournament.minMember ?? 1;
	if (merged.maxMember == null) merged.maxMember = tournament.maxMember ?? 1;
	if (merged.foodInfo == null) merged.foodInfo = tournament.foodInfo ?? '';
	if (merged.descriptionInfo == null) merged.descriptionInfo = tournament.descriptionInfo ?? '';
	if (merged.numberOfRounds == null) merged.numberOfRounds = tournament.numberOfRounds ?? 1;
	if (merged.playMode == null) merged.playMode = tournament.playMode;
	if (merged.tournamentMode == null) merged.tournamentMode = tournament.tournamentMode;
	if (merged.roundTimings == null) merged.roundTimings = tournament.roundTimings ?? [];
	merged.status = 'active';

	const parsed = publishSchema.safeParse(merged);
	if (!parsed.success) {
		const msg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
		res.status(400).json({ message: msg, error: true, code: 'VALIDATION_ERROR', details: parsed.error.issues });
		return;
	}

	const data = parsed.data;
	if (data.sponsorId) {
		const sponsorOk = await sponsorBelongsToClub(data.sponsorId, clubId);
		if (!sponsorOk) {
			res.status(400).json({ message: 'Sponsor must belong to the selected club and be active' });
			return;
		}
	}

	const payload = toDbPayload(data);

	await Tournament.findByIdAndUpdate(id, payload, { new: true });

	res.json({
		message: 'Tournament published',
		tournament: {
			id,
			name: data.name,
			club: clubId,
			status: 'active'
		}
	});
}
