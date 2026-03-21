import type { SponsorStatus } from "../../../../types/domain";
export interface PlatformSponsorLeanDoc {
	_id: string | { toString(): string };
	name: string;
	description?: string | null;
	logoUrl?: string | null;
	link?: string | null;
	status: SponsorStatus;
}

export function mapPlatformSponsor(sponsor: PlatformSponsorLeanDoc) {
	return {
		id: String(sponsor._id),
		name: sponsor.name,
		description: sponsor.description ?? null,
		logoUrl: sponsor.logoUrl ?? null,
		link: sponsor.link ?? null,
		status: sponsor.status
	};
}
