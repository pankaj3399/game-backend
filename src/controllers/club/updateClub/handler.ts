import mongoose from 'mongoose';
import type { Request } from 'express';
import type { UpdateClubInput } from '../../../validation/club.schemas';
import { error, ok } from '../../../shared/helpers';
import {
	countClubCourts,
	createNewCourt,
	deleteRemovedClubCourts,
	findCanonicalCourtIdsForClub,
	findClubByIdForUpdate,
	updateExistingCourt
} from './queries';

type Session = NonNullable<Request['user']>;

export async function updateClubFlow(clubId: string, data: UpdateClubInput, session: Session) {
	const isAdmin = session.adminOf?.some((id) => id.toString() === clubId);
	if (!isAdmin && session.role !== 'super_admin') {
		return error(403, 'You do not have permission to edit this club');
	}

	const club = await findClubByIdForUpdate(clubId);
	if (!club) {
		return error(404, 'Club not found');
	}

	if (typeof data.name === 'string') {
		club.name = data.name.trim();
	}
	if (typeof data.address === 'string') {
		club.address = data.address.trim();
	}
	if (data.website !== undefined) {
		club.website = data.website?.trim() || null;
	}
	if (data.bookingSystemUrl !== undefined) {
		club.bookingSystemUrl = data.bookingSystemUrl?.trim() || null;
	}
	if (data.coordinates) {
		const [lon, lat] = data.coordinates;
		club.coordinates = { type: 'Point', coordinates: [lon, lat] };
	}

	const txSession = await mongoose.startSession();
	txSession.startTransaction();

	try {
		await club.save({ session: txSession });

		if (Array.isArray(data.courts)) {
			const suppliedCourtIds = data.courts
				.map((court) => court.id)
				.filter((id): id is string => !!id && mongoose.Types.ObjectId.isValid(id));

			const canonicalCourtIds = await findCanonicalCourtIdsForClub(suppliedCourtIds, clubId, txSession);

			await deleteRemovedClubCourts(clubId, canonicalCourtIds, txSession);

			for (const court of data.courts) {
				const courtData = {
					name: court.name.trim(),
					type: court.type,
					placement: court.placement
				};

				if (court.id && mongoose.Types.ObjectId.isValid(court.id)) {
					await updateExistingCourt(court.id, clubId, courtData, txSession);
				} else {
					await createNewCourt(clubId, courtData, txSession);
				}
			}
		}

		await txSession.commitTransaction();
		txSession.endSession();
	} catch (err) {
		await txSession.abortTransaction();
		txSession.endSession();
		return error(500, 'Internal server error');
	}

	const courtCount = await countClubCourts(clubId);

	return ok({
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
