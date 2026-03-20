import Sponsor, { type SponsorDocument } from '../../../../models/Sponsor';
import type { PlatformSponsorLeanDoc } from './mapper';
import type { CreatePlatformSponsorInput } from './validation';

export async function findAllPlatformSponsors() {
	return Sponsor.find({ scope: 'global' })
		.select('name description logoUrl link status')
		.sort({ createdAt: -1 })
		.lean<PlatformSponsorLeanDoc[]>()
		.exec();
}

export async function createPlatformSponsorRecord(input: CreatePlatformSponsorInput) {
	return Sponsor.create({
		name: input.name.trim(),
		description: input.description?.trim() || null,
		logoUrl: input.logoUrl ?? null,
		link: input.link ?? null,
		scope: 'global',
		club: null,
		status: 'active'
	});
}

export async function findPlatformSponsorById(sponsorId: string): Promise<SponsorDocument | null> {
	return Sponsor.findOne({
		_id: sponsorId,
		scope: 'global'
	}).exec();
}

export async function deletePlatformSponsorRecord(sponsorId: string) {
	return Sponsor.deleteOne({
		_id: sponsorId,
		scope: 'global'
	});
}
