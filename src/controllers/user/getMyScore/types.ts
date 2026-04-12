export type MyScoreMatchMode = 'singles' | 'doubles';

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
	myScore: number | null;
	opponentScore: number | null;
	didWin: boolean | null;
}

export interface MyScoreResponse {
	summary: {
		totalMatches: number;
		totalWins: number;
		glicko2: {
			rating: number;
			rd: number;
		};
	};
	filters: {
		mode: 'all' | MyScoreMatchMode;
		range: 'last30Days' | 'allTime';
	};
	entries: MyScoreEntry[];
}
