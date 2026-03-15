import type { SponsorStatus } from '../domain/sponsor';

export interface SponsorPublicItem {
	id: string;
	name: string;
	description: string | null;
	logoUrl: string | null;
	link: string | null;
}

export interface SponsorResponse {
	id: string;
	name: string;
	description: string | null;
	logoUrl: string | null;
	link: string | null;
	status: SponsorStatus;
}

export interface SponsorStatusSummary {
	plan: 'free' | 'premium';
	canManageSponsors: boolean;
}

export interface SponsorUpdateResponse {
	id: string;
	name: string;
	logoUrl: string | null;
	link: string | null;
	status: SponsorStatus;
}

export interface UpdateSponsorBody {
	name?: string;
	description?: string | null;
	logoUrl?: string | null;
	link?: string | null;
	status?: SponsorStatus;
}

export type UpdateSponsorInput = UpdateSponsorBody;
