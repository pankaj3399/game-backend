import mongoose, { Document } from 'mongoose';
import {
	GAME_MODES,
	GAME_PLAY_MODES,
	GAME_STATUSES,
	type GameMode,
	type GamePlayMode,
	type GameStatus
} from '../types/domain/game';

// Define the IGame interface
export interface IGame extends Document {
	playerOne: mongoose.Types.ObjectId;
	playerTwo: mongoose.Types.ObjectId;
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
	playMode: GamePlayMode;
	createdAt?: Date;
	updatedAt?: Date;
}

// Define the Game schema
const gameSchema = new mongoose.Schema<IGame>(
	{
		playerOne: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
		playerTwo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
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
	if (this.playerOne && this.playerTwo && this.playerOne.equals(this.playerTwo)) {
		this.invalidate('playerTwo', 'playerOne and playerTwo must be different');
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
gameSchema.index({ playerOne: 1, playerTwo: 1, createdAt: -1 });

const Game = mongoose.model<IGame>('Game', gameSchema);

export default Game;
