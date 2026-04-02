import { logger } from '../../../lib/logger';
import Sponsor from '../../../models/Sponsor';
import type { CreateSponsorInput } from '../../../validation/sponsor.schemas';
import { error, ok } from '../../../shared/helpers';
import { isDuplicateKeyError } from '../../../shared/mongoErrors';
import { mapCreatedSponsor } from './mapper';

export async function createSponsorFlow(input: CreateSponsorInput, club: string) {
	try {
		const sponsor = await Sponsor.create({
			name: input.name,
			description: input.description?.trim() || null,
			logoUrl: input.logoUrl ?? null,
			link: input.link ?? null,
			scope: 'club',
			club: club,
			status: 'active'
		});

		return ok({ sponsor: mapCreatedSponsor(sponsor) }, { status: 201, message: 'Sponsor created' });
	} catch (err) {
		if (isDuplicateKeyError(err)) {
			return error(409, 'A sponsor with this name already exists');
		}
		logger.error('Error creating sponsor', { err });
		return error(500, 'Internal server error');
	}
}
