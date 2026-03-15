export const TOURNAMENT_PLAY_MODES = ['TieBreak10', '1set', '3setTieBreak10', '3set', '5set'] as const;
export type TournamentPlayMode = (typeof TOURNAMENT_PLAY_MODES)[number];

export const TOURNAMENT_MODES = ['singleDay', 'period'] as const;
export type TournamentMode = (typeof TOURNAMENT_MODES)[number];

export const TOURNAMENT_STATUSES = ['active', 'draft', 'inactive'] as const;
export type TournamentStatus = (typeof TOURNAMENT_STATUSES)[number];
