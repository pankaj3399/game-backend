import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import Club from '../../models/Club';
import Court from '../../models/Court';
import Sponsor from '../../models/Sponsor';

export interface CourtGroup {
	placement: 'outdoor' | 'indoor';
	count: number;
	surface: string;
}

export interface ClubSponsorPublic {
	id: string;
	name: string;
	logoUrl: string | null;
	link: string | null;
}

export interface ClubPublicResponse {
	id: string;
	name: string;
	description: string | null;
	address: string;
	website: string | null;
	bookingSystemUrl: string | null;
	courtCount: number;
	courts: CourtGroup[];
	sponsors: ClubSponsorPublic[];
}

const SURFACE_LABELS: Record<string, string> = {
	concrete: 'Concrete',
	clay: 'Clay',
	hard: 'Hard',
	grass: 'Grass',
	carpet: 'Carpet',
	other: 'Other'
};

/**
 * GET /api/clubs/public/:clubId
 * Returns public club info for display on club detail page.
 * No authentication required.
 */
export async function getClubPublic(req: Request, res: Response) {
	const clubId = Array.isArray(req.params.clubId) ? req.params.clubId[0] : req.params.clubId;
	if (!clubId || !mongoose.Types.ObjectId.isValid(clubId)) {
		res.status(400).json({ message: 'Invalid club ID' });
		return;
	}

	const club = await Club.findOne({ _id: clubId, status: 'active' })
		.select('_id name description address website bookingSystemUrl plan')
		.lean()
		.exec();

	if (!club) {
		res.status(404).json({ message: 'Club not found' });
		return;
	}


	const courtsPromise = Court.find({club: new mongoose.Types.ObjectId(clubId)})
		.select('type placement')
		.lean()
		.exec();

	const sponsorsPromise = club.plan === 'premium' ? Sponsor.find({
		scope: 'club',
		clubId: new mongoose.Types.ObjectId(clubId),
		status: 'active'
		})
		.select('_id name logoUrl link')
		.lean()
		.exec()
	 : Promise.resolve([])


	 const [courts,sponsors] = await Promise.all([courtsPromise,sponsorsPromise])

	const isPremium = club.plan === 'premium';
	const sponsorsResponse: ClubSponsorPublic[] = isPremium
		? sponsors.map((s) => ({
				id: (s._id as mongoose.Types.ObjectId).toString(),
				name: s.name,
				logoUrl: s.logoUrl ?? null,
				link: s.link ?? null
			}))
		: [];

	const courtGroups = new Map<'outdoor' | 'indoor', Map<string, number>>();
	courtGroups.set('outdoor', new Map());
	courtGroups.set('indoor', new Map());

	for (const c of courts) {
		const placement = c.placement;
		const surface = SURFACE_LABELS[c.type] ?? c.type;
		const map = courtGroups.get(placement)!;
		map.set(surface, (map.get(surface) ?? 0) + 1);
	}

	const courtsResponse: CourtGroup[] = [];
	for (const placement of ['outdoor', 'indoor'] as const) {
		const map = courtGroups.get(placement)!;
		const total = [...map.values()].reduce((a, b) => a + b, 0);
		if (total > 0) {
			const surfaces = [...map.entries()]
				.sort((a, b) => b[1] - a[1])
				.map(([s]) => s)
				.join(', ');
			courtsResponse.push({ placement, count: total, surface: surfaces });
		}
	}

	const response: ClubPublicResponse = {
		id: (club._id as mongoose.Types.ObjectId).toString(),
		name: club.name,
		description: club.description ?? null,
		address: club.address,
		website: club.website ?? null,
		bookingSystemUrl: club.bookingSystemUrl ?? null,
		courtCount: courts.length,
		courts: courtsResponse,
		sponsors: sponsorsResponse
	};

	res.json({ club: response });
}
