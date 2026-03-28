import type { SponsorResponse, SponsorStatusSummary } from '../../../types/api/sponsor';

export interface SponsorListDoc {
	_id: { toString(): string };
	name: string;
	description?: string | null;
	logoUrl?: string | null;
	link?: string | null;
	status: 'active' | 'paused';
}

export function mapClubSponsorItem(sponsor: SponsorListDoc, isPremium: boolean): SponsorResponse {
	return {
		id: sponsor._id.toString(),
		name: sponsor.name,
		description: sponsor.description ?? null,
		logoUrl: sponsor.logoUrl ?? null,
		link: sponsor.link ?? null,
		status: isPremium ? sponsor.status : 'paused'
	};
}

export function mapSponsorStatusSummary(
	plan: 'free' | 'premium',
	hasPremiumAccess: boolean
): SponsorStatusSummary {
	return {
		plan,
		canManageSponsors: hasPremiumAccess
	};
}
