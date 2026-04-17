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
		matchDurationMinutes: {
			type: Number,
			min: [5, 'matchDurationMinutes must be at least 5'],
			max: [240, 'matchDurationMinutes must be at most 240'],
			default: null
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

scheduleSchema.index({ tournament: 1 }, { unique: true });
scheduleSchema.index({ status: 1, updatedAt: -1 });

const Schedule = mongoose.model<ISchedule>('Schedule', scheduleSchema);

export default Schedule;
