import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import Tournament from '../../models/Tournament';
import Court from '../../models/Court';
import Club from '../../models/Club';
import { createDraftSchema, publishSchema } from '../../validation/tournament.schemas';
import { userCanManageClub, sponsorBelongsToClub } from '../../lib/tournamentPermissions';
import { toDbPayload } from '../../lib/tournamentPayload';
import { logger } from '../../lib/logger';

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

	const validationInput: Record<string, unknown> = { ...rawBody };

	const ctx = {
		userId: sessionUser._id,
		userRole: sessionUser.role,
		adminOf: (sessionUser.adminOf ?? []) as mongoose.Types.ObjectId[]
	};

	if (status === 'active' && validationInput.tournamentMode === 'singleDay') {
		const selectedCourts = Array.isArray(validationInput.courts) ? validationInput.courts : [];
		const selectedClubId = typeof validationInput.club === 'string' ? validationInput.club : undefined;

		if (selectedCourts.length === 0 && selectedClubId) {
			if (!mongoose.Types.ObjectId.isValid(selectedClubId)) {
				// Let schema validation report invalid club format; just don't auto-fetch courts.
			} else {
				const canManageSelectedClub = await userCanManageClub(ctx, selectedClubId);
				if (!canManageSelectedClub) {
					res.status(403).json({
						message: 'You do not have permission to create tournaments for this club'
					});
					return;
				}

			const clubCourts = await Court.find({
				club: new mongoose.Types.ObjectId(selectedClubId)
			})
				.select('_id')
				.lean()
				.exec();

			if (clubCourts.length === 0) {
				res.status(400).json({
					message: 'Selected club has no courts. Add at least one court before publishing this tournament.'
				});
				return;
			}

			validationInput.courts = clubCourts.map((c) => c._id.toString());
			}
		}
	}

	const schema = status === 'draft' ? createDraftSchema : publishSchema;
	const parsed = schema.safeParse(validationInput);
	if (!parsed.success) {
		const msg = parsed.error.issues.map((i) => i.message).join('; ');
		res.status(400).json({ message: msg});
		logger.error('Invalid tournament creation request', { body: req.body, errors: msg });
		return;
	}

	const data = parsed.data;
	const clubId = data.club;

	const canManage = await userCanManageClub(ctx, clubId);
	if (!canManage) {
		res.status(403).json({ message: 'You do not have permission to create tournaments for this club' });
		return;
	}

	const club = await Club.findById(clubId).select('_id').lean().exec();
	if (!club) {
		res.status(404).json({ message: 'Club not found' });
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
	} catch (err: unknown) {
		const mongoErr = err as { code?: number; message?: string };
		if (mongoErr?.code === 11000) {
			res.status(400).json({ message: 'Tournament already exists'});
			logger.error('Tournament already exists', { err });
			return;
		}
		res.status(500).json({ message: 'Failed to create tournament' });
		logger.error('Failed to create tournament', { err });
	}
}
