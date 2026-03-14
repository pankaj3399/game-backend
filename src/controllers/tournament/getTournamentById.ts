import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import Tournament, { type ITournament } from '../../models/Tournament';
import Sponsor from '../../models/Sponsor';
import { userCanManageClub } from '../../lib/tournamentPermissions';

/** Full tournament with populated club/sponsorId – used with .lean<TournamentPopulated>() */
type TournamentPopulated = Omit<ITournament, 'club' | 'sponsorId' | 'courts' | 'participants'> & {
	club?: { _id: mongoose.Types.ObjectId; name?: string } | null;
	sponsorId?: {
		_id: mongoose.Types.ObjectId;
		name?: string;
		logoUrl?: string | null;
		link?: string | null;
	} | null;
	courts?: Array<{ _id: mongoose.Types.ObjectId; name?: string; type?: string; placement?: string }>;
	participants?: Array<{ _id: mongoose.Types.ObjectId; name?: string | null; alias?: string | null }>;
};

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
		.populate('courts', 'name type placement')
		.populate('participants', 'name alias')
		.lean<TournamentPopulated>()
		.exec();

	if (!tournament) {
		res.status(404).json({ message: 'Tournament not found' });
		return;
	}

	const clubIdStr = tournament.club?._id?.toString();

	if (!clubIdStr) {
		res.status(400).json({ message: 'Tournament has no club' });
		return;
	}

	// Check permission:
	// - active tournaments: any authenticated user can view
	// - draft/inactive tournaments: only club managers can view
	const isManager = await userCanManageClub(
		{
			userId: new mongoose.Types.ObjectId(sessionUser._id),
			userRole: sessionUser.role,
			adminOf: (sessionUser.adminOf ?? []) as mongoose.Types.ObjectId[]
		},
		clubIdStr
	);
	if (tournament.status !== 'active' && !isManager) {
		res.status(403).json({ message: 'You do not have permission to view this tournament' });
		return;
	}

	const participants = (tournament.participants ?? []) as Array<{
		_id?: mongoose.Types.ObjectId | string;
		name?: string | null;
		alias?: string | null;
	}>;
	const participantItems = participants
		.map((p) => {
			const participantId = p?._id?.toString?.() ?? '';
			return {
				id: participantId,
				name: p.name ?? null,
				alias: p.alias ?? null
			};
		})
		.filter((p) => Boolean(p.id));
	const participantIdSet = new Set(participantItems.map((p) => p.id));

	const spotsFilled = participantItems.length;
	const spotsTotal = Math.max(1, tournament.maxMember ?? 1);
	const isParticipant = participantIdSet.has(sessionUser._id.toString());
	const canJoin = tournament.status === 'active' && !isManager && !isParticipant && spotsFilled < spotsTotal;

	
	const courts = ((tournament.courts ?? []) as Array<{
		_id?: mongoose.Types.ObjectId | string;
		name?: string;
		type?: string;
		placement?: string;
	}>).map((court) => ({
		id: court._id?.toString?.() ?? '',
		name: court.name ?? '',
		type: court.type ?? null,
		placement: court.placement ?? null
	}));

	const clubSponsors = await Sponsor.find({
		scope: 'club',
		clubId: new mongoose.Types.ObjectId(clubIdStr),
		status: 'active'
	})
		.select('name logoUrl link')
		.lean()
		.exec();

	const clubSponsorsList = clubSponsors.map((s) => ({
		id: s._id.toString(),
		name: s.name ?? '',
		logoUrl: s.logoUrl ?? null,
		link: s.link ?? null
	}));

	res.json({
		tournament: {
			id: tournament._id.toString(),
			name: tournament.name,
			logo: tournament.logo ?? null,
			club: tournament.club
				? {
						id: String(tournament.club._id),
						name: tournament.club.name ?? ''
					}
				: null,
			sponsor: tournament.sponsorId
				? {
						id: String(tournament.sponsorId._id),
						name: tournament.sponsorId.name ?? '',
						logoUrl: tournament.sponsorId.logoUrl ?? null,
						link: tournament.sponsorId.link ?? null
					}
				: null,
			clubSponsors: clubSponsorsList,
			date: tournament.date ? new Date(tournament.date).toISOString() : null,
			startTime: tournament.startTime ?? null,
			endTime: tournament.endTime ?? null,
			playMode: tournament.playMode,
			tournamentMode: tournament.tournamentMode,
			externalFee: tournament.externalFee ?? 0,
			minMember: tournament.minMember ?? 1,
			maxMember: tournament.maxMember ?? 1,
			playTime: tournament.playTime ?? null,
			pauseTime: tournament.pauseTime ?? null,
			courts,
			foodInfo: tournament.foodInfo ?? '',
			descriptionInfo: tournament.descriptionInfo ?? '',
			numberOfRounds: tournament.numberOfRounds ?? 1,
			roundTimings: (tournament.roundTimings ?? []).map((r) => ({
				startDate: r?.startDate ? new Date(r.startDate).toISOString() : null,
				endDate: r?.endDate ? new Date(r.endDate).toISOString() : null
			})),
			status: tournament.status,
			participants: participantItems,
			progress: {
				spotsFilled,
				spotsTotal,
				percentage: Math.round((spotsFilled / spotsTotal) * 100)
			},
			permissions: {
				canEdit: isManager,
				canJoin,
				isParticipant
			},
			createdAt: tournament.createdAt ? new Date(tournament.createdAt).toISOString() : null,
			updatedAt: tournament.updatedAt ? new Date(tournament.updatedAt).toISOString() : null
		}
	});
}
