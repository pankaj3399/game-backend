import type { SponsorDocument } from '../../../models/Sponsor';
import { error, ok } from '../../../shared/helpers';
import { isDuplicateKeyError } from '../../../shared/mongoErrors';
import type { UpdateSponsorInput } from '../../../validation/sponsor.schemas';
import { mapUpdatedSponsor } from './mapper';

export async function updateSponsorFlow(
	input: UpdateSponsorInput,
	clubPlan: 'free' | 'premium',
	sponsor: SponsorDocument
) {
	if (input.name !== undefined) sponsor.name = input.name.trim();
	if (input.description !== undefined) sponsor.description = input.description?.trim() || null;
	if (input.logoUrl !== undefined) sponsor.logoUrl = input.logoUrl ?? null;
	if (input.link !== undefined) sponsor.link = input.link ?? null;

	if (input.status !== undefined) {
		if (clubPlan !== 'premium' && input.status === 'active') {
			return error(403, 'Cannot activate sponsors on a free plan. Upgrade to premium.');
		}
		sponsor.status = input.status;
	}

	try {
		await sponsor.save();
	} catch (err) {
		if (isDuplicateKeyError(err)) {
			return error(409, 'A sponsor with this name already exists');
		}

		const mongoErr = err as { name?: string };
		if (mongoErr.name === 'VersionError') {
			return error(409, 'Version conflict');
		}

		return error(500, 'Internal server error');
	}

	return ok({ sponsor: mapUpdatedSponsor(sponsor) }, { status: 200, message: 'Sponsor updated' });
}
