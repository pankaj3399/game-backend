import mongoose from 'mongoose';
import type { CreateClubInput } from '../../../validation/club.schemas';
import { error, ok } from '../../../shared/helpers';
import {
	findClubByName,
	createClubWithSession,
	insertCourtsWithSession,
	findUserByIdWithSession,
	pushAdminClubWithSession
} from './queries';

export async function createClubFlow(data: CreateClubInput, userId: string) {
	const existing = await findClubByName(data.name.trim());
	if (existing) {
		return error(409, 'A club with this name already exists');
	}

	const [lon, lat] = data.coordinates;
	const session = await mongoose.startSession();
	session.startTransaction();

	try {
		const club = await createClubWithSession(
			{
				name: data.name.trim(),
				address: data.address.trim(),
				website: data.website?.trim() || null,
				bookingSystemUrl: data.bookingSystemUrl?.trim() || null,
				coordinates: { type: 'Point' as const, coordinates: [lon, lat] },
				defaultAdminId: userId,
				plan: 'free',
				expiresAt: null
			},
			session
		);

		const courtDocs = (data.courts ?? []).map((court) => ({
			club: club._id,
			name: court.name.trim(),
			type: court.type,
			placement: court.placement
		}));

		await insertCourtsWithSession(courtDocs, session);

		const user = await findUserByIdWithSession(userId, session);
		if (!user) {
			await session.abortTransaction();
			session.endSession();
			return error(404, 'Authenticated user not found');
		}

		await pushAdminClubWithSession(user, club._id, session);

		await session.commitTransaction();
		session.endSession();

		return ok(
			{
				club: {
					id: club._id,
					name: club.name,
					address: club.address,
					website: club.website,
					bookingSystemUrl: club.bookingSystemUrl,
					courtCount: courtDocs.length
				}
			},
			{ status: 201, message: 'Club created successfully' }
		);
	} catch (err) {
		await session.abortTransaction();
		session.endSession();

		const mongoErr = err as { code?: number; name?: string };
		if (
			mongoErr?.code === 11000 ||
			mongoErr?.name === 'MongoServerError' ||
			mongoErr?.name === 'MongoError'
		) {
			return error(409, 'A club with this name already exists');
		}

		return error(500, 'Internal server error');
	}
}
