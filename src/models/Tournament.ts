import mongoose, { Document, Schema } from 'mongoose';
import { LogError } from '../lib/logger';
import {
	TOURNAMENT_MODES,
	TOURNAMENT_PLAY_MODES,
	TOURNAMENT_STATUSES,
	type TournamentMode,
	type TournamentPlayMode,
	type TournamentStatus
} from '../types/domain/tournament';
import Schedule from './Schedule';

// Define the ITournament interface
export interface ITournament extends Document {
	club: mongoose.Types.ObjectId;
	createdBy: mongoose.Types.ObjectId;
	schedule?: mongoose.Types.ObjectId;
	sponsor?: mongoose.Types.ObjectId;
	name: string;
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
		createdBy: {
			type: Schema.Types.ObjectId,
			ref: 'User',
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
			required: true,
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
tournamentSchema.index({ createdBy: 1, status: 1, createdAt: -1 });
tournamentSchema.index({ club: 1, name: 1 }, { unique: true });

tournamentSchema.pre('validate', function () {
	if (this.maxMember != null && this.minMember != null && this.maxMember < this.minMember) {
		this.invalidate('maxMember', 'maxMember must be greater than or equal to minMember');
	}
});

tournamentSchema.post('save', async function (doc) {
	if (doc.schedule) return;

	try {
		const schedule = await Schedule.findOneAndUpdate(
			{ tournament: doc._id },
			{ $setOnInsert: { tournament: doc._id, currentRound: 0 } },
			{ upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
		)
			.select('_id')
			.lean()
			.exec();

		if (schedule?._id) {
			await doc.updateOne({ schedule: schedule._id }).exec();
		}
	} catch (err) {
		LogError('Tournament', 'save', 'post(save)/schedule-link', err);
	}
});

const Tournament = mongoose.model<ITournament>('Tournament', tournamentSchema);

export default Tournament;