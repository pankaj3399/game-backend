import mongoose from 'mongoose';
import Sponsor from '../../../models/Sponsor';
import type { CreateSponsorInput } from '../../../validation/sponsor.schemas';
import { ok } from '../../../shared/helpers';
import { mapCreatedSponsor } from './mapper';

export async function createSponsorFlow(input: CreateSponsorInput, club: string) {
	const sponsor = await Sponsor.create({
		name: input.name.trim(),
		description: input.description?.trim() || null,
		logoUrl: input.logoUrl ?? null,
		link: input.link ?? null,
		scope: 'club',
		club: club,
		status: 'active'
	});

	return ok({ sponsor: mapCreatedSponsor(sponsor) }, { status: 201, message: 'Sponsor created' });
}
