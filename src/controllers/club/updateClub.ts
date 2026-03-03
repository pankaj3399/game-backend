import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import Club from '../../models/Club';
import Court from '../../models/Court';

export interface UpdateClubBody {
	name?: string;
	website?: string | null;
	bookingSystemUrl?: string | null;
	address?: string;
	coordinates?: [number, number];
	courts?: Array<{
		id?: string;
		name: string;
		type: 'concrete' | 'clay' | 'hard' | 'grass' | 'carpet' | 'other';
		placement: 'indoor' | 'outdoor';
	}>;
}

/**
 * PATCH /api/clubs/:clubId
 * Update club and its courts. User must be admin of this club.
 */
export async function updateClub(req: Request, res: Response) {
	const sessionUser = req.user;
	if (!sessionUser?._id) {
		res.status(401).json({ message: 'Not authenticated' });
		return;
	}

	const clubId = Array.isArray(req.params.clubId) ? req.params.clubId[0] : req.params.clubId;
	if (!clubId || !mongoose.Types.ObjectId.isValid(clubId)) {
		res.status(400).json({ message: 'Invalid club ID' });
		return;
	}

	const isAdmin = sessionUser.adminOf?.some(
		(id) => id.toString() === clubId
	);
	if (!isAdmin && sessionUser.role !== 'super_admin') {
		res.status(403).json({ message: 'You do not have permission to edit this club' });
		return;
	}

	const club = await Club.findById(clubId);
	if (!club) {
		res.status(404).json({ message: 'Club not found' });
		return;
	}

	const body = req.body as UpdateClubBody;
	if (body.name?.trim()) club.name = body.name.trim();
	if (body.address !== undefined) club.address = body.address?.trim() ?? '';
	if (body.website !== undefined) club.website = body.website?.trim() || null;
	if (body.bookingSystemUrl !== undefined)
		club.bookingSystemUrl = body.bookingSystemUrl?.trim() || null;

	if (body.coordinates !== undefined && Array.isArray(body.coordinates) && body.coordinates.length === 2) {
		const [lon, lat] = body.coordinates;
		if (
			typeof lon === 'number' &&
			typeof lat === 'number' &&
			lon >= -180 && lon <= 180 &&
			lat >= -90 && lat <= 90
		) {
			club.coordinates = { type: 'Point', coordinates: [lon, lat] };
		}
	}

	await club.save();

	if (Array.isArray(body.courts)) {
		const existingCourtIds = body.courts
			.map((c) => c.id)
			.filter((id): id is string => !!id && mongoose.Types.ObjectId.isValid(id));

		await Court.deleteMany({
			club: clubId,
			_id: { $nin: existingCourtIds }
		});

		for (const c of body.courts) {
			if (!c?.name?.trim()) continue;

			const courtData = {
				name: c.name.trim(),
				type: c.type || 'concrete',
				placement: c.placement || 'outdoor'
			};

			if (c.id && mongoose.Types.ObjectId.isValid(c.id)) {
				await Court.findOneAndUpdate(
					{ _id: c.id, club: clubId },
					{ $set: courtData }
				);
			} else {
				await Court.create({
					club: clubId,
					...courtData
				});
			}
		}
	}

	const courtCount = await Court.countDocuments({ club: clubId });

	res.json({
		club: {
			id: club._id,
			name: club.name,
			address: club.address,
			website: club.website,
			bookingSystemUrl: club.bookingSystemUrl,
			courtCount
		}
	});
}
