import mongoose from 'mongoose';
import Sponsor from '../../../models/Sponsor';
import type { CreateSponsorInput } from '../../../validation/sponsor.schemas';
import { error, ok } from '../../../shared/helpers';
import { mapCreatedSponsor } from './mapper';

export async function createSponsorFlow(input: CreateSponsorInput, club: string) {
	try {
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
	} catch (err) {
		const mongoErr = err as { code?: number; name?: string };
		if (
			mongoErr.code === 11000 &&
			(mongoErr.name === 'MongoServerError' || mongoErr.name === 'MongoError')
		) {
			return error(409, 'Sponsor name already exists for this scope');
		}

		return error(500, 'Internal server error');
	}
}
