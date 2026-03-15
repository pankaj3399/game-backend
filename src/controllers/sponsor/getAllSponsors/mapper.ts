export interface SponsorListDoc {
	_id: string | { toString(): string };
	name: string;
	description?: string | null;
	logoUrl?: string | null;
	link?: string | null;
}

export function mapPublicSponsorListItem(sponsor: SponsorListDoc) {
	return {
		id: String(sponsor._id),
		name: sponsor.name,
		description: sponsor.description ?? null,
		logoUrl: sponsor.logoUrl ?? null,
		link: sponsor.link ?? null
	};
}
