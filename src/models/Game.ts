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
	side1: IGameTeam;
	side2: IGameTeam;
	court?: mongoose.Types.ObjectId;
	tournament?: mongoose.Types.ObjectId;
	schedule?: mongoose.Types.ObjectId;
	score: {
		playerOneScores: (number | 'wo')[];
		playerTwoScores: (number | 'wo')[];
	};
	startTime?: Date;
	endTime?: Date;
	detachedFromRound?: number;
	detachedFromSlot?: number;
	isHistorical?: boolean;
	detachedFromScheduleAt?: Date;
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
		side1: { type: gameTeamSchema, required: true },
		side2: { type: gameTeamSchema, required: true },
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
		detachedFromRound: { type: Number, index: true, sparse: true },
		detachedFromSlot: { type: Number, sparse: true },
		isHistorical: { type: Boolean, default: false },
		detachedFromScheduleAt: { type: Date },
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

gameSchema.pre('validate', function (this: any) {
	if (!this.side1 || !this.side2) {
		this.invalidate('side1', 'both side1 and side2 are required');
		this.invalidate('side2', 'both side1 and side2 are required');
		return;
	}

	const expectedSideSize = this.matchType === 'doubles' ? 2 : 1;
	const allPlayers: string[] = [];
	const sides: Array<{ key: 'side1' | 'side2'; value: IGameTeam | undefined }> = [
		{ key: 'side1', value: this.side1 },
		{ key: 'side2', value: this.side2 },
	];

	for (const side of sides) {
		const players = Array.isArray(side.value?.players) ? side.value.players : [];

		if (players.length !== expectedSideSize) {
			this.invalidate(
				`${side.key}.players`,
				`Each side must contain exactly ${expectedSideSize} player${expectedSideSize === 1 ? '' : 's'} for ${this.matchType}`
			);
		}

		for (const player of players) {
			allPlayers.push(player.toString());
		}
	}

	if (new Set(allPlayers).size !== allPlayers.length) {
		this.invalidate('side1', 'all match participants must be unique across both sides');
		this.invalidate('side2', 'all match participants must be unique across both sides');
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
gameSchema.index({ gameMode: 1, status: 1, 'side1.players': 1, createdAt: -1 });
gameSchema.index({ gameMode: 1, status: 1, 'side2.players': 1, createdAt: -1 });
gameSchema.index({ gameMode: 1, status: 1, 'side1.players': 1, startTime: 1 });
gameSchema.index({ gameMode: 1, status: 1, 'side2.players': 1, startTime: 1 });
gameSchema.index({ matchType: 1, status: 1, createdAt: -1 });

const Game = mongoose.model<IGame>('Game', gameSchema);

export default Game;
