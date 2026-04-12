import { Types } from 'mongoose';
import Game from '../../../models/Game';
import User from '../../../models/User';

interface PopulatedPlayer {
	_id: Types.ObjectId;
	name?: string | null;
	alias?: string | null;
}

interface PopulatedTournament {
	_id: Types.ObjectId;
	name?: string | null;
}

export interface MyScoreGameDoc {
	_id: Types.ObjectId;
	playerOne: PopulatedPlayer | Types.ObjectId | null;
	playerTwo: PopulatedPlayer | Types.ObjectId | null;
	tournament: PopulatedTournament | Types.ObjectId | null;
	score?: {
		playerOneScores?: unknown[];
		playerTwoScores?: unknown[];
	} | null;
	playMode?: string | null;
	startTime?: Date | null;
	endTime?: Date | null;
	createdAt?: Date | null;
}

interface UserRatingSnapshot {
	rating: number;
	rd: number;
}

export async function fetchCompletedTournamentGamesForUser(userId: string): Promise<MyScoreGameDoc[]> {
	const userObjectId = new Types.ObjectId(userId);

	return Game.find({
		gameMode: 'tournament',
		status: 'finished',
		$or: [{ playerOne: userObjectId }, { playerTwo: userObjectId }],
	})
		.select('_id playerOne playerTwo tournament score playMode startTime endTime createdAt')
		.populate('playerOne', 'name alias')
		.populate('playerTwo', 'name alias')
		.populate('tournament', 'name')
		.sort({ endTime: -1, startTime: -1, createdAt: -1 })
		.limit(1000)
		.lean<MyScoreGameDoc[]>()
		.exec();
}

export async function fetchUserRatingSnapshot(userId: string): Promise<UserRatingSnapshot | null> {
	const user = await User.findById(userId)
		.select('elo.rating elo.rd')
		.lean<{ elo?: { rating?: number | null; rd?: number | null } }>()
		.exec();

	if (!user) {
		return null;
	}

	const rating = typeof user.elo?.rating === 'number' ? user.elo.rating : 1500;
	const rd = typeof user.elo?.rd === 'number' ? user.elo.rd : 200;

	return {
		rating,
		rd,
	};
}
