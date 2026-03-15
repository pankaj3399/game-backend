import mongoose, { Document, Schema } from 'mongoose';
import {
	TOURNAMENT_MODES,
	TOURNAMENT_PLAY_MODES,
	TOURNAMENT_STATUSES,
	type TournamentMode,
	type TournamentPlayMode,
	type TournamentStatus
} from '../types/domain/tournament';

// Define the ITournament interface
export interface ITournament extends Document {
	club: mongoose.Types.ObjectId;
	schedule?: mongoose.Types.ObjectId;
	sponsor?: mongoose.Types.ObjectId;
	name: string;
	logo?: string;
	date?: Date;
	startTime?: string;
	endTime?: string;
	playMode: TournamentPlayMode;
	tournamentMode: TournamentMode;
	entryFee: number;
	minMember: number;
	maxMember: number;
	duration: string;
	breakDuration: string;
	courts: mongoose.Types.ObjectId[];
	foodInfo?: string;
	descriptionInfo?: string;
	status: TournamentStatus;
	createdAt?: Date;
	updatedAt?: Date;
	participants: mongoose.Types.ObjectId[];
}

// Define the Tournament schema
const tournamentSchema = new mongoose.Schema<ITournament>(
	{
		club: {
			type: Schema.Types.ObjectId,
			ref: 'Club',
			required: true
		},
		schedule: {
			type: Schema.Types.ObjectId,
			ref: 'Schedule'
		},
		sponsor: {
			type: Schema.Types.ObjectId,
			ref: 'Sponsor',
			required: false
		},
		name: {
			type: String,
			required: true
		},
		logo: {
			type: String,
			required: false
		},
		date: {
			type: Date
		},
		startTime: {
			type: String
		},
		endTime: {
			type: String
		},
		playMode: {
			type: String,
			enum: {
				values: TOURNAMENT_PLAY_MODES,
				message: '{VALUE} is not supported'
			},
			default: 'TieBreak10' // Default value
		},
		tournamentMode: {
			type: String,
			enum: {
				values: TOURNAMENT_MODES,
				message: '{VALUE} is not supported'
			},
			default: 'singleDay' // Default value
		},
		entryFee: {
			type: Number,
			required: false,
			min: [0, 'Entry fee must be a non-negative number'],
			default: 0
		},
		minMember: {
			type: Number,
			required: false,
			min: [1, 'Minimum members must be at least 1'],
			default: 1
		},
		maxMember: {
			type: Number,
			required: false,
			min: [1, 'Maximum members must be at least 1'],
			default: 1
		},
		duration: {
			type: String,
			required: true
		},
		breakDuration: {
			type: String,
			required: true
		},
		courts: {
			type: [
				{
					type: Schema.Types.ObjectId,
					ref: 'Court'
				}
			],
			default: []
		},
		foodInfo: {
			type: String,
			required: false,
			maxlength: 500,
			default: ''
		},
		descriptionInfo: {
			type: String,
			required: false,
			maxlength: 1000,
			default: ''
		},
		status: {
			type: String,
			enum: {
				values: TOURNAMENT_STATUSES,
				message: '{VALUE} is not supported'
			},
			required: true,
			default: 'draft'
		},
		participants: {
			type: [
				{
					type: Schema.Types.ObjectId,
					ref: 'User'
				}
			],
			default: []
		}
	},
	{
		timestamps: true
	}
);

tournamentSchema.index({ club: 1, status: 1, date: -1, createdAt: -1 });

tournamentSchema.pre('validate', function () {
	if (this.maxMember != null && this.minMember != null && this.maxMember < this.minMember) {
		this.invalidate('maxMember', 'maxMember must be greater than or equal to minMember');
	}
});

// tournamentSchema.pre('save', async function () {
// 	if (!this.schedule) {
// 		const _schedule = await mongoose.model('Schedule').create({ tournament: this._id, currentRound: 0 });
// 		this.schedule = _schedule._id;
// 	}
// });

const Tournament = mongoose.model<ITournament>('Tournament', tournamentSchema);

export default Tournament;