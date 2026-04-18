import mongoose, { Document } from 'mongoose';
import {
	GAME_MODES,
	GAME_PLAY_MODES,
	GAME_STATUSES,
	MATCH_TYPES,
	type GameMode,
	type GamePlayMode,
	type MatchType,
	type GameStatus
} from '../types/domain/game';

export interface IGameTeam {
	players: mongoose.Types.ObjectId[];
}

// Define the IGame interface
export interface IGame extends Document {
	teams: [IGameTeam, IGameTeam];
	court?: mongoose.Types.ObjectId;
	tournament?: mongoose.Types.ObjectId;
	schedule?: mongoose.Types.ObjectId;
	score: {
		playerOneScores: (number | 'wo')[];
		playerTwoScores: (number | 'wo')[];
	};
	startTime?: Date;
	endTime?: Date;
	status: GameStatus;
	gameMode: GameMode;
	matchType: MatchType;
	playMode: GamePlayMode;
	createdAt?: Date;
	updatedAt?: Date;
}

const gameTeamSchema = new mongoose.Schema<IGameTeam>(
	{
		players: {
			type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }],
			required: true,
			default: []
		}
	},
	{ _id: false }
);

// Define the Game schema
const gameSchema = new mongoose.Schema<IGame>(
	{
		teams: {
			type: [gameTeamSchema],
			required: true,
			validate: {
				validator: (value: IGameTeam[]) => Array.isArray(value) && value.length === 2,
				message: 'teams must contain exactly two teams'
			}
		},
		court: { type: mongoose.Schema.Types.ObjectId, ref: 'Court' },
		tournament: { type: mongoose.Schema.Types.ObjectId, ref: 'Tournament' },
		schedule: { type: mongoose.Schema.Types.ObjectId, ref: 'Schedule' },
		score: {
			playerOneScores: {
				type: [mongoose.Schema.Types.Mixed],
				default: [],
				validate: {
					validator: (v: unknown[]) =>
						Array.isArray(v) && v.every((el) => el === 'wo' || (typeof el === 'number' && Number.isFinite(el))),
					message: 'Each score must be a finite number or "wo"'
				}
			},
			playerTwoScores: {
				type: [mongoose.Schema.Types.Mixed],
				default: [],
				validate: {
					validator: (v: unknown[]) =>
						Array.isArray(v) && v.every((el) => el === 'wo' || (typeof el === 'number' && Number.isFinite(el))),
					message: 'Each score must be a finite number or "wo"'
				}
			}
		},
		startTime: { type: Date },
		endTime: { type: Date },
		status: {
			type: String,
			enum: {
				values: GAME_STATUSES,
				message: '{VALUE} is not supported'
			},
			default: 'active',
			required: true
		},
		gameMode: {
			type: String,
			enum: {
				values: GAME_MODES,
				message: '{VALUE} is not supported'
			},
			default: 'tournament',
			required: true
		},
		matchType: {
			type: String,
			enum: {
				values: MATCH_TYPES,
				message: '{VALUE} is not supported'
			},
			default: 'singles',
			required: true
		},
		playMode: {
			type: String,
			enum: {
				values: GAME_PLAY_MODES,
				message: '{VALUE} is not supported'
			},
			default: 'TieBreak10',
			required: true
		}
	},
	{
		timestamps: true
	}
);

gameSchema.pre('validate', function () {
	if (!Array.isArray(this.teams) || this.teams.length !== 2) {
		this.invalidate('teams', 'teams must contain exactly two teams');
		return;
	}

 	const expectedTeamSize = this.matchType === 'doubles' ? 2 : 1;
	const allPlayers: string[] = [];

	for (let teamIndex = 0; teamIndex < this.teams.length; teamIndex += 1) {
		const team = this.teams[teamIndex];
		const players = Array.isArray(team?.players) ? team.players : [];

		if (players.length !== expectedTeamSize) {
			this.invalidate(
				`teams.${teamIndex}.players`,
				`Each team must contain exactly ${expectedTeamSize} player${expectedTeamSize === 1 ? '' : 's'} for ${this.matchType}`
			);
		}

		for (const player of players) {
			allPlayers.push(player.toString());
		}
	}

	if (new Set(allPlayers).size !== allPlayers.length) {
		this.invalidate('teams', 'all match participants must be unique across both teams');
	}

	if (this.gameMode === 'tournament' && !this.tournament) {
		this.invalidate('tournament', 'tournament is required when gameMode is tournament');
	}

	if (this.gameMode === 'standalone' && this.tournament) {
		this.invalidate('tournament', 'tournament should not be set when gameMode is standalone');
	}
});

gameSchema.index({ tournament: 1, status: 1, createdAt: -1 });
gameSchema.index({ schedule: 1, status: 1, createdAt: -1 });
gameSchema.index({ gameMode: 1, status: 1, 'teams.players': 1, createdAt: -1 });
gameSchema.index({ gameMode: 1, status: 1, 'teams.players': 1, startTime: 1 });
gameSchema.index({ matchType: 1, status: 1, createdAt: -1 });

const Game = mongoose.model<IGame>('Game', gameSchema);

export default Game;
