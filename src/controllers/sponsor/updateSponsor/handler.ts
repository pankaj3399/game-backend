import type { SponsorDocument } from '../../../models/Sponsor';
import { error, ok } from '../../../shared/helpers';
import type { UpdateSponsorInput } from '../../../validation/sponsor.schemas';
import { mapUpdatedSponsor } from './mapper';

export async function updateSponsorFlow(
	input: UpdateSponsorInput,
	clubHasPremiumAccess: boolean,
	sponsor: SponsorDocument
) {
	if (input.name !== undefined) sponsor.name = input.name.trim();
	if (input.description !== undefined) sponsor.description = input.description?.trim() || null;
	if (input.logoUrl !== undefined) sponsor.logoUrl = input.logoUrl ?? null;
	if (input.link !== undefined) sponsor.link = input.link ?? null;

	if (input.status !== undefined) {
		if (!clubHasPremiumAccess && input.status === 'active') {
			return error(
				403,
				'Cannot activate sponsors: subscription does not currently grant access. Please renew or upgrade.'
			);
		}
		sponsor.status = input.status;
	}

	try {
		await sponsor.save();
	} catch (err) {
		const mongoErr = err as { code?: number; name?: string };
		if (
			mongoErr.code === 11000 &&
			(mongoErr.name === 'MongoServerError' || mongoErr.name === 'MongoError')
		) {
			return error(409, 'Sponsor name already exists for this club');
		}

		if (mongoErr.name === 'VersionError') {
			return error(409, 'Version conflict');
		}

		return error(500, 'Internal server error');
	}

	return ok({ sponsor: mapUpdatedSponsor(sponsor) }, { status: 200, message: 'Sponsor updated' });
}
