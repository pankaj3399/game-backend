import { logger } from '../../../../lib/logger';
import { error, ok } from '../../../../shared/helpers';
import { mapPlatformSponsor } from '../shared/mapper';
import { findPlatformSponsorById } from '../shared/queries';
import type { UpdatePlatformSponsorInput } from '../shared/validation';

export async function updatePlatformSponsorFlow(sponsorId: string, input: UpdatePlatformSponsorInput) {
	try{
		const sponsor = await findPlatformSponsorById(sponsorId);

	if (!sponsor) {
		return error(404, 'Sponsor not found');
	}

	if (input.name !== undefined) sponsor.name = input.name.trim();
	if (input.description !== undefined) sponsor.description = input.description?.trim() || null;
	if (input.logoUrl !== undefined) sponsor.logoUrl = input.logoUrl ?? null;
	if (input.link !== undefined) sponsor.link = input.link ?? null;
	if (input.status !== undefined) sponsor.status = input.status;

	try {
		await sponsor.save();
	} catch (err) {
		const mongoErr = err as { name?: string; code?: number };
		if (
			mongoErr.code === 11000 &&
			(mongoErr.name === 'MongoServerError' || mongoErr.name === 'MongoError')
		) {
			return error(409, 'Sponsor name already exists for this scope');
		}

		if (mongoErr.name === 'VersionError') {
			return error(409, 'Sponsor was modified concurrently. Please retry.');
		}
		return error(500, 'Internal server error');
	}

	return ok(
		{
			sponsor: mapPlatformSponsor(sponsor)
		},
		{ status: 200, message: 'Platform sponsor updated' }
	);
	} catch (err) {
		logger.error('Error updating platform sponsor', { err });
		return error(500, 'Internal server error');
	}
}
