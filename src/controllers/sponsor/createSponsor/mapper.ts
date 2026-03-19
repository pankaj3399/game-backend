import type { SponsorResponse } from '../../../types/api/sponsor';

export interface SponsorCreateDoc {
	_id: { toString(): string };
	name: string;
	description?: string | null;
	logoUrl?: string | null;
	link?: string | null;
	status: 'active' | 'paused';
}

export function mapCreatedSponsor(sponsor: SponsorCreateDoc): SponsorResponse {
	return {
		id: sponsor._id.toString(),
		name: sponsor.name,
		description: sponsor.description ?? null,
		logoUrl: sponsor.logoUrl ?? null,
		link: sponsor.link ?? null,
		status: sponsor.status
	};
}
