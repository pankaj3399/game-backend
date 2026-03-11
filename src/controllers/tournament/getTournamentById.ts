import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import Tournament from '../../models/Tournament';
import Club from '../../models/Club';

/**
 * GET /api/tournaments/:id
 * Get tournament details. User must be admin or organiser of the tournament's club.
 */
export async function getTournamentById(req: Request, res: Response) {
	const sessionUser = req.user;
	if (!sessionUser?._id) {
		res.status(401).json({ message: 'Not authenticated' });
		return;
	}

	const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
	if (!id || !mongoose.Types.ObjectId.isValid(id)) {
		res.status(400).json({ message: 'Invalid tournament ID' });
		return;
	}

	const tournament = await Tournament.findById(id)
		.populate('club', 'name')
		.populate('sponsorId', 'name logoUrl link')
		.populate('courts', 'name')
		.lean()
		.exec();

	if (!tournament) {
		res.status(404).json({ message: 'Tournament not found' });
		return;
	}

	const clubId = (tournament.club as { _id?: unknown })?._id ?? tournament.club;
	const clubIdStr = typeof clubId === 'string' ? clubId : (clubId as mongoose.Types.ObjectId)?.toString();

	// Check permission: user must be admin or organiser of club
	const adminClubs = (sessionUser.adminOf ?? []) as mongoose.Types.ObjectId[];
	const isAdmin = adminClubs.some((cid) => cid.toString() === clubIdStr);
	if (!isAdmin && sessionUser.role !== 'super_admin') {
		const club = await Club.findById(clubIdStr).select('organiserIds').lean().exec();
		const organiserIds = (club?.organiserIds ?? []) as mongoose.Types.ObjectId[];
		const isOrganiser = organiserIds.some((oid) => oid.toString() === sessionUser._id.toString());
		if (!isOrganiser) {
			res.status(403).json({ message: 'You do not have permission to view this tournament' });
			return;
		}
	}

	res.json({
		tournament: {
			id: tournament._id,
			name: tournament.name,
			logo: tournament.logo ?? null,
			club: tournament.club,
			sponsorId: tournament.sponsorId ?? null,
			date: tournament.date ?? null,
			startTime: tournament.startTime ?? null,
			endTime: tournament.endTime ?? null,
			playMode: tournament.playMode,
			tournamentMode: tournament.tournamentMode,
			memberFee: tournament.memberFee ?? 0,
			externalFee: tournament.externalFee ?? 0,
			minMember: tournament.minMember ?? 1,
			maxMember: tournament.maxMember ?? 1,
			playTime: tournament.playTime ?? null,
			pauseTime: tournament.pauseTime ?? null,
			courts: tournament.courts ?? [],
			foodInfo: tournament.foodInfo ?? '',
			descriptionInfo: tournament.descriptionInfo ?? '',
			numberOfRounds: tournament.numberOfRounds ?? 1,
			roundTimings: tournament.roundTimings ?? [],
			status: tournament.status,
			participants: tournament.participants ?? [],
			createdAt: tournament.createdAt,
			updatedAt: tournament.updatedAt
		}
	});
}
