export const GAME_STATUSES = ['active', 'draft', 'inactive', 'cancelled', 'finished'] as const;
export type GameStatus = (typeof GAME_STATUSES)[number];

export const GAME_MODES = ['standalone', 'tournament'] as const;
export type GameMode = (typeof GAME_MODES)[number];

export const MATCH_TYPES = ['singles', 'doubles'] as const;
export type MatchType = (typeof MATCH_TYPES)[number];

export const GAME_PLAY_MODES = ['TieBreak10', '1set', '3setTieBreak10', '3set', '5set'] as const;
export type GamePlayMode = (typeof GAME_PLAY_MODES)[number];
