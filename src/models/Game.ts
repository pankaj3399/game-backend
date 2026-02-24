import mongoose, { Document } from 'mongoose';

// Define the IGame interface
export interface IGame extends Document {
	playerOne: mongoose.Types.ObjectId;
	playerTwo: mongoose.Types.ObjectId;
	club?: mongoose.Types.ObjectId;
	court?: mongoose.Types.ObjectId;
	tournament?: mongoose.Types.ObjectId;
	score: {
		playerOneScores: (number | 'wo')[];
		playerTwoScores: (number | 'wo')[];
	};
	startTime?: Date;
	endTime?: Date;
	status: 'active' | 'draft' | 'inactive' | 'cancelled' | 'finished';
	gameMode: 'standalone' | 'tournament';
	playMode: 'TieBreak10' | '1set' | '3setTieBreak10' | '3set' | '5set';
	createdAt?: Date;
	updatedAt?: Date;
}

// Define the Game schema
const gameSchema = new mongoose.Schema<IGame>(
	{
		playerOne: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
		playerTwo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
		club: { type: mongoose.Schema.Types.ObjectId, ref: 'Club' },
		court: { type: mongoose.Schema.Types.ObjectId },
		tournament: { type: mongoose.Schema.Types.ObjectId, ref: 'Tournament' },
		score: {
			playerOneScores: { type: [mongoose.Schema.Types.Mixed], default: [] }, // Allows numbers or "wo"
			playerTwoScores: { type: [mongoose.Schema.Types.Mixed], default: [] } // Allows numbers or "wo"
		},
		startTime: { type: Date },
		endTime: { type: Date },
		status: {
			type: String,
			enum: ['active', 'draft', 'inactive', 'cancelled', 'finished'],
			default: 'active',
			required: true
		},
		gameMode: {
			type: String,
			enum: ['standalone', 'tournament'],
			default: 'tournament',
			required: true
		},
		playMode: {
			type: String,
			enum: ['TieBreak10', '1set', '3setTieBreak10', '3set', '5set'],
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
});

const Game = mongoose.models.Game ?? mongoose.model<IGame>('Game', gameSchema);

export default Game;