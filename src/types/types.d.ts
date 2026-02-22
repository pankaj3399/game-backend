export type ICompleteSignup = {
	email: string;
	alias: string;
	name: string;
	dateOfBirth: string;
	gender: string;
	club: string;
	appleId?: string;
};

export type IUpdateProfile = {
	email: string;
	alias: string;
	name: string;
	dateOfBirth: string;
	gender: string;
};

export type IAddClub = {
	name: string;
	address: string;
	coordinates: {
		longitude: number;
		latitude: number;
	};
	website?: string;
	courts: {
		name: string;
		courtType: 'grass' | 'clay' | 'concrete' | 'carpet' | 'asphalt' | 'other';
		placement: 'indoor' | 'outdoor';
	}[];
};

export type IAddTournament = {
	club: string;
	name: string;
	logo: string;
	date: Date;
	startTime: string;
	endTime: string;
	playMode: 'tiebreak' | 'tiebreakallinone' | 'tiebreakdeathmode'; // Optional gender
	memberFee: number;
	externalFee: number;
	minMember: number;
	maxMember: number;
	courts: string[];
	foodInfo: string;
	descriptionInfo: string;
	pauseTime: string;
	playTime: string;
	numberOfRounds: string;
	roundTimings: { startDate: Date; endDate: Date }[];
	status: 'active' | 'draft';
	tournamentMode: 'singleDay' | 'period';
};

export type ITournamentTiming = {
	pauseTime: string;
	playTime: string;
	numberOfRounds: string;
	roundTimings: { startDate: Date; endDate: Date }[];
};

export type IAddFavoriteClub = {
	club: string;
};

export type IParticipate = {
	tournament: string;
};
