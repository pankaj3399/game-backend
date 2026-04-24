import mongoose, { Schema } from 'mongoose';
import { SCHEDULE_STATUSES, type ScheduleStatus } from '../types/domain/schedule';

export const SCHEDULE_MATCH_MODES = ['singles', 'doubles'] as const;
export type ScheduleMatchMode = (typeof SCHEDULE_MATCH_MODES)[number];

export interface IScheduleRound {
	game: mongoose.Types.ObjectId;
	slot: number;
	round: number;
	mode: ScheduleMatchMode;
}

export interface ISchedule {
	tournament: mongoose.Types.ObjectId;
	currentRound: number;
	matchesPerPlayer: number;
	matchDurationMinutes?: number | null;
	breakTimeMinutes?: number | null;
	rounds: IScheduleRound[];
	status: ScheduleStatus;
	createdAt: Date;
	updatedAt: Date;
}

const scheduleRoundSchema = new Schema<IScheduleRound>(
	{
		game: {
			type: Schema.Types.ObjectId,
			ref: 'Game',
			required: true
		},
		slot: {
			type: Number,
			required: true,
			min: [1, 'slot must be at least 1']
		},
		round: {
			type: Number,
			required: true,
			min: [1, 'round must be at least 1']
		},
		mode: {
			type: String,
			enum: {
				values: SCHEDULE_MATCH_MODES,
				message: '{VALUE} is not supported'
			},
			required: true,
			default: 'singles'
		}
	},
	{ _id: false }
);

const scheduleSchema = new Schema<ISchedule>(
	{
		tournament: {
			type: Schema.Types.ObjectId,
			ref: 'Tournament',
			required: true,
			unique: true
		},
		currentRound: {
			type: Number,
			required: true,
			default: 0,
			min: [0, 'currentRound must be at least 0']
		},
		matchesPerPlayer: {
			type: Number,
			required: true,
			min: [1, 'matchesPerPlayer must be at least 1'],
			max: [20, 'matchesPerPlayer cannot be greater than 20'],
			default: 1,
			validate: {
				validator: (v: unknown) => typeof v === 'number' && Number.isInteger(v),
				message: 'matchesPerPlayer must be an integer'
			}
		},
		matchDurationMinutes: {
			type: Number,
			min: [5, 'matchDurationMinutes must be at least 5'],
			max: [120, 'matchDurationMinutes must be at most 120'],
			default: null,
			validate: {
				validator: (v: unknown) =>
					v == null ||
					(typeof v === 'number' && Number.isInteger(v) && v >= 5 && v <= 120 && v % 5 === 0),
				message: 'matchDurationMinutes must be in 5-minute intervals between 5 and 120'
			}
		},
		breakTimeMinutes: {
			type: Number,
			min: [0, 'breakTimeMinutes must be at least 0'],
			max: [120, 'breakTimeMinutes must be at most 120'],
			default: null
		},
		rounds: {
			type: [scheduleRoundSchema],
			default: []
		},
		status: {
			type: String,
			enum: {
				values: SCHEDULE_STATUSES,
				message: '{VALUE} is not supported'
			},
			required: true,
			default: 'draft'
		}
	},
	{
		timestamps: true
	}
);

scheduleSchema.index({ status: 1, updatedAt: -1 });

const Schedule = mongoose.model<ISchedule>('Schedule', scheduleSchema);

export default Schedule;
