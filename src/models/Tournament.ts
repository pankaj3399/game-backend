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
import { DEFAULT_TOURNAMENT_TIMEZONE, isValidIanaTimeZone } from '../shared/timezone';
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
	timezone?: string;
	playMode: TournamentPlayMode;
	tournamentMode: TournamentMode;
	entryFee: number;
	minMember: number;
	maxMember: number;
	/** Omitted on some drafts until publish; persisted tournaments should set both. */
	duration?: number | null;
	breakDuration?: number | null;
	totalRounds: number;
	foodInfo?: string;
	descriptionInfo?: string;
	status: TournamentStatus;
	createdAt?: Date;
	updatedAt?: Date;
	participants: mongoose.Types.ObjectId[];
	firstRoundScheduledAt?: Date | null;
	completedAt?: Date | null;
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
		timezone: {
			type: String,
			default: DEFAULT_TOURNAMENT_TIMEZONE,
			validate: {
				validator: (v: unknown) => typeof v === 'string' && isValidIanaTimeZone(v),
				message: 'timezone must be a valid IANA timezone (for example: Asia/Kolkata)'
			}
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
			type: Number,
			required: false,
			min: [5, 'duration must be at least 5 minutes'],
			max: [240, 'duration must be at most 240 minutes'],
			default: 60,
			validate: {
				validator: (v: unknown) =>
					v == null || (typeof v === 'number' && Number.isInteger(v) && v >= 5 && v <= 240),
				message: 'duration must be an integer between 5 and 240 minutes, or omitted'
			}
		},
		breakDuration: {
			type: Number,
			required: false,
			min: [0, 'breakDuration must be at least 0 minutes'],
			max: [120, 'breakDuration must be at most 120 minutes'],
			default: 0,
			validate: {
				validator: (v: unknown) =>
					v == null || (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 120),
				message: 'breakDuration must be an integer between 0 and 120 minutes, or omitted'
			}
		},
		totalRounds: {
			type: Number,
			required: true,
			min: [1, 'totalRounds must be at least 1'],
			max: [100, 'totalRounds cannot be greater than 100'],
			default: 1,
			validate: {
				validator: (v: unknown) => typeof v === 'number' && Number.isInteger(v),
				message: 'totalRounds must be an integer'
			}
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
		},
		firstRoundScheduledAt: {
			type: Date,
			default: null
		},
		completedAt: {
			type: Date,
			default: null
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
		const session = doc.$session?.();
		const schedule = await Schedule.findOneAndUpdate(
			{ tournament: doc._id },
			{ $setOnInsert: { tournament: doc._id, currentRound: 0 } },
			{
				upsert: true,
				returnDocument: 'after',
				setDefaultsOnInsert: true,
				runValidators: true,
				...(session ? { session } : {})
			}
		)
			.select('_id')
			.lean()
			.exec();

		if (!schedule?._id) {
			LogError('Tournament', 'save', 'post(save)/schedule-missing', new Error('Schedule upsert returned without _id'));
			return;
		}

		await mongoose
			.model<ITournament>('Tournament')
			.updateOne(
				{ _id: doc._id, $or: [{ schedule: { $exists: false } }, { schedule: null }] },
				{ $set: { schedule: schedule._id } },
				session ? { session } : {}
			)
			.exec();
	} catch (err) {
		LogError('Tournament', 'save', 'post(save)/schedule-link', err);
	}
});

const Tournament = mongoose.model<ITournament>('Tournament', tournamentSchema);

export default Tournament;