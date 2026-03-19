import type { SponsorUpdateResponse } from '../../../types/api/sponsor';

export interface SponsorUpdateDoc {
	_id: { toString(): string };
	name: string;
	logoUrl?: string | null;
	link?: string | null;
	status: 'active' | 'paused';
}

export function mapUpdatedSponsor(sponsor: SponsorUpdateDoc){
	return {
		id: sponsor._id.toString(),
		name: sponsor.name,
		logoUrl: sponsor.logoUrl ?? null,
		link: sponsor.link ?? null,
		status: sponsor.status
	};
}
