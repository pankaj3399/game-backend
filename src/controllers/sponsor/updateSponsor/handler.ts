import type { SponsorDocument } from '../../../models/Sponsor';
import { error, ok } from '../../shared/helpers';
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

	await sponsor.save();

	return ok({ sponsor: mapUpdatedSponsor(sponsor) }, { status: 200, message: 'Sponsor updated' });
}
