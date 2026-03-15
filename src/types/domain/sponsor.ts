export const SPONSOR_SCOPES = ['global', 'club'] as const;
export type SponsorScope = (typeof SPONSOR_SCOPES)[number];

export const SPONSOR_STATUSES = ['active', 'paused'] as const;
export type SponsorStatus = (typeof SPONSOR_STATUSES)[number];
