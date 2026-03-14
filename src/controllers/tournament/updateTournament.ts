import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import Tournament from '../../models/Tournament';
import { createOrUpdateDraftSchema } from '../../validation/tournament.schemas';
import { userCanManageClub, sponsorBelongsToClub } from '../../lib/tournamentPermissions';
import { toDbPayload } from '../../lib/tournamentPayload';
import { logger } from '../../lib/logger';
/**
 * PATCH /api/tournaments/:id
 * Update tournament. Only draft tournaments can be updated. User must have club permission.
 */
export async function updateTournament(req: Request<{ id: string }>, res: Response) {
	try {

		const sessionUser = req.user;
		if (!sessionUser?._id) {
			res.status(401).json({ message: 'Not authenticated' });
			return;
		}

		const id = req.params.id;
		if (!id || !mongoose.Types.ObjectId.isValid(id)) {
			res.status(400).json({ message: 'Invalid tournament ID' });
			return;
		}

		const bodyParse = createOrUpdateDraftSchema.safeParse(req.body);
		if (!bodyParse.success) {
			const msg = bodyParse.error.issues.map((i) => i.message).join('; ');
			res.status(400).json({ message: msg });
			return;
		}

		const tournament = await Tournament.findById(id).lean().exec();
		if (!tournament) {
			res.status(404).json({ message: 'Tournament not found' });
			return;
		}

		if (tournament.status !== 'draft') {
			res.status(400).json({ message: 'Only draft tournaments can be updated. Use publish to activate.' });
			return;
		}

		const clubId = tournament.club.toString();
		const ctx = {
			userId: sessionUser._id,
			userRole: sessionUser.role,
			adminOf: sessionUser.adminOf ?? []
		};

		const canManage = await userCanManageClub(ctx, clubId);
		if (!canManage) {
			res.status(403).json({ message: 'You do not have permission to update this tournament' });
			return;
		}

		const data = bodyParse.data;
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

		// Mirror Tournament pre('validate') invariant for query updates.
		const effectiveMinMember = data.minMember ?? tournament.minMember;
		const effectiveMaxMember = data.maxMember ?? tournament.maxMember;
		if (
			effectiveMinMember != null &&
			effectiveMaxMember != null &&
			effectiveMaxMember < effectiveMinMember
		) {
			res.status(400).json({
				message: 'maxMember must be greater than or equal to minMember'
			});
			return;
		}
	
		const updated = await Tournament.findByIdAndUpdate(
			id,
			{ $set: payload },
			{ new: true, runValidators: true }
		).lean().exec();

		if (!updated) {
			res.status(404).json({ message: 'Tournament not found' });
			return;
		}

		res.json({
			message: 'Tournament updated',
			tournament: {
				id: updated._id,
				name: updated.name,
				club: updated.club,
				status: updated.status,
				date: updated.date,
				updatedAt: updated.updatedAt
			}
		});
	}
	catch (err: unknown) {
		res.status(500).json({ message: 'Internal server error', error: true });
		logger.error('Error updating tournament', { err });
	}
}
