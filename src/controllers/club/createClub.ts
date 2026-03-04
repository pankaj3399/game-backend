import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import Club from '../../models/Club';
import Court from '../../models/Court';
import User from '../../models/User';

export interface CreateClubBody {
	name: string;
	website?: string | null;
	bookingSystemUrl?: string | null;
	address: string;
	coordinates: [number, number]; // [longitude, latitude]
	courts?: Array<{
		name: string;
		type: 'concrete' | 'clay' | 'hard' | 'grass' | 'carpet' | 'other';
		placement: 'indoor' | 'outdoor';
	}>;
}

/**
 * POST /api/clubs
 * Create a new club. Creator is added to user.adminOf.
 * RBAC: Requires club_admin or super_admin role.
 */
export async function createClub(req: Request, res: Response) {
	const sessionUser = req.user;
	if (!sessionUser?._id) {
		res.status(401).json({ message: 'Not authenticated' });
		return;
	}

	const body = req.body as CreateClubBody;
	const { name, website, bookingSystemUrl, address, coordinates, courts = [] } = body;

	if (!name?.trim()) {
		res.status(400).json({ message: 'Club name is required' });
		return;
	}
	if (!address?.trim()) {
		res.status(400).json({ message: 'Address is required' });
		return;
	}
	if (!coordinates || !Array.isArray(coordinates) || coordinates.length !== 2) {
		res.status(400).json({ message: 'Valid coordinates [longitude, latitude] are required' });
		return;
	}

	const [lon, lat] = coordinates;
	if (
		typeof lon !== 'number' ||
		typeof lat !== 'number' ||
		lon < -180 || lon > 180 ||
		lat < -90 || lat > 90
	) {
		res.status(400).json({ message: 'Coordinates must be [longitude, latitude] within valid ranges' });
		return;
	}

	const existing = await Club.findOne({ name: name.trim() }).select('_id').exec();
	if (existing) {
		res.status(409).json({ message: 'A club with this name already exists' });
		return;
	}

	const session = await mongoose.startSession();
	session.startTransaction();
	try {
		const [club] = await Club.create(
			[
				{
					name: name.trim(),
					address: address.trim(),
					website: website?.trim() || null,
					bookingSystemUrl: bookingSystemUrl?.trim() || null,
					coordinates: { type: 'Point' as const, coordinates: [lon, lat] },
					defaultAdminId: sessionUser._id,
					plan: 'free',
					expiresAt: null,
					subscriptionStatus: 'subscribed'
				}
			],
			{ session }
		);

		const courtDocs = courts
			.filter((c) => c?.name?.trim())
			.map((c) => ({
				club: club._id,
				name: c.name.trim(),
				type: c.type || 'concrete',
				placement: c.placement || 'outdoor'
			}));

		if (courtDocs.length > 0) {
			await Court.insertMany(courtDocs, { session });
		}

		const user = await User.findById(sessionUser._id).session(session);
		if (!user) {
			throw new Error('Authenticated user not found');
		}
		user.adminOf.push(club._id);
		await user.save({ session });

		await session.commitTransaction();

		res.status(201).json({
			club: {
				id: club._id,
				name: club.name,
				address: club.address,
				website: club.website,
				bookingSystemUrl: club.bookingSystemUrl,
				courtCount: courtDocs.length
			}
		});
	} catch (err: unknown) {
		await session.abortTransaction();
		const mongoErr = err as { code?: number; name?: string };
		if (mongoErr?.code === 11000 || mongoErr?.name === 'MongoServerError' || mongoErr?.name === 'MongoError') {
			res.status(409).json({ message: 'A club with this name already exists' });
			return;
		}
		throw err;
	} finally {
		session.endSession();
	}
}
