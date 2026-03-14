import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import Tournament from '../../models/Tournament';
import { userCanManageClub } from '../../lib/tournamentPermissions';

/**
 * POST /api/tournaments/:id/join
 * Join an active tournament.
 */
export async function joinTournament(req: Request<{ id: string }>, res: Response) {
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

	const tournament = await Tournament.findById(id)
		.select('_id name status minMember maxMember participants')
		.populate('club')
		.lean()
		.exec();

	if (!tournament) {
		res.status(404).json({ message: 'Tournament not found' });
		return;
	}

	if (tournament.status !== 'active') {
		res.status(400).json({ message: 'Only active tournaments can be joined' });
		return;
	}

	const clubId = tournament.club?._id?.toString();
	if (!clubId) {
		res.status(400).json({ message: 'Tournament has no club' });
		return;
	}
	const isManager = await userCanManageClub(
		{
			userId: new mongoose.Types.ObjectId(sessionUser._id),
			userRole: sessionUser.role,
			adminOf: sessionUser.adminOf ?? []
		},
		clubId
	);
	if (isManager) {
		res.status(400).json({ message: 'Club managers cannot join this tournament as participants' });
		return;
	}

	const userId = sessionUser._id.toString();
	const alreadyJoined = (tournament.participants ?? []).some((pid) => pid.toString() === userId);
	if (alreadyJoined) {
		res.status(400).json({ message: 'Already joined' });
		return;
	}

	const returnedDoc = await Tournament.findOneAndUpdate(
		{
			_id: tournament._id,
			status: 'active',
			$expr: { $lt: [{ $size: { $ifNull: ['$participants', []] } }, { $ifNull: ['$maxMember', 1] }] }
		},
		{ $addToSet: { participants: sessionUser._id } },
		{ new: true }
	)
		.select('participants maxMember')
		.lean()
		.exec();

	if (!returnedDoc) {
		res.status(400).json({ message: 'This tournament is already full' });
		return;
	}

	const spotsFilled = (returnedDoc.participants ?? []).length;
	const isParticipant = (returnedDoc.participants ?? []).some((pid) => pid.toString() === userId);

	res.json({
		message: 'Successfully joined tournament',
		tournament: {
			id: tournament._id.toString(),
			spotsFilled,
			spotsTotal: Math.max(1, returnedDoc.maxMember ?? 1),
			isParticipant
		}
	});
}
