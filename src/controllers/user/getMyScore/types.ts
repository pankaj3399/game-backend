export type MyScoreMatchMode = 'singles' | 'doubles';

/** Aggregate score for a match row: numeric total, walkover loss (WO), or walkover win (W). */
export type MyScoreAggregateDisplay = number | 'WO' | 'W';

export interface MyScoreEntry {
	id: string;
	playedAt: string;
	tournament: {
		id: string | null;
		name: string;
	};
	opponent: {
		id: string;
		name: string;
	};
	mode: MyScoreMatchMode;
	myScore: MyScoreAggregateDisplay | null;
	opponentScore: MyScoreAggregateDisplay | null;
	didWin: boolean | null;
	/** 'pendingScore' = awaiting opponent QR confirmation; 'finished' = fully confirmed. */
	status: 'pendingScore' | 'finished';
}

export interface MyScoreResponse {
	player: {
		id: string;
		displayName: string;
	};
	summary: {
		totalMatches: number;
		totalWins: number;
		/** True when win total was computed from a capped scan (see TOTALS_SCAN_CAP in queries). */
		winsTruncated: boolean;
		glicko2: {
			rating: number;
			rd: number;
		};
	};
	filters: {
		mode: 'all' | MyScoreMatchMode;
		range: 'last30Days' | 'allTime';
	};
	pagination: {
		page: number;
		limit: number;
		total: number;
		totalPages: number;
	};
	entries: MyScoreEntry[];
}
