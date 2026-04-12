import mongoose, { Schema, type HydratedDocument, type UpdateQuery } from 'mongoose';
import { SCHEDULE_STATUSES, type ScheduleStatus } from '../types/domain/schedule';

export interface IScheduleRound {
	game: mongoose.Types.ObjectId;
	slot: number;
	round: number;
}

export interface ISchedule {
	tournament: mongoose.Types.ObjectId;
	currentRound: number;
	rounds: IScheduleRound[];
	status: ScheduleStatus;
	createdAt: Date;
	updatedAt: Date;
}

export type ScheduleDocument = HydratedDocument<ISchedule>;

type RoundLike = { round: number; slot: number; game: unknown };

function validateScheduleRoundsInvariants(
	rounds: RoundLike[],
	currentRound: number,
	invalidate: (path: 'rounds' | 'currentRound', message: string) => void
) {
	const usedPairs = new Set<string>();
	const seenGames = new Set<string>();

	for (const entry of rounds) {
		const gameKey = entry.game != null ? String(entry.game) : '';
		if (seenGames.has(gameKey)) {
			invalidate('rounds', `Duplicate game reference ${entry.game} in rounds`);
			return;
		}
		seenGames.add(gameKey);

		const pairKey = `${entry.round}:${entry.slot}`;
		if (usedPairs.has(pairKey)) {
			invalidate('rounds', `Duplicate slot ${entry.slot} in round ${entry.round}`);
			return;
		}
		usedPairs.add(pairKey);
	}

	const maxRound = rounds.reduce((max, entry) => Math.max(max, entry.round), 0);
	if (rounds.length === 0) {
		if (currentRound > 0) {
			invalidate('currentRound', 'currentRound cannot be greater than the highest round in rounds');
		}
	} else if (currentRound > maxRound) {
		invalidate('currentRound', 'currentRound cannot be greater than the highest round in rounds');
	}
}

function updateTouchesRoundsOrCurrentRound(update: Record<string, unknown>) {
	const set = update.$set;
	if (set && typeof set === 'object') {
		const s = set as Record<string, unknown>;
		if ('rounds' in s || 'currentRound' in s) {
			return true;
		}
	}
	const setOnInsert = update.$setOnInsert;
	if (setOnInsert && typeof setOnInsert === 'object') {
		const si = setOnInsert as Record<string, unknown>;
		if ('rounds' in si || 'currentRound' in si) {
			return true;
		}
	}
	const push = update.$push;
	if (push && typeof push === 'object' && 'rounds' in (push as Record<string, unknown>)) {
		return true;
	}
	return false;
}

function simulateScheduleAfterFindOneAndUpdate(
	existing: Pick<ISchedule, 'rounds' | 'currentRound'> | null,
	update: UpdateQuery<ISchedule>
): { rounds: RoundLike[]; currentRound: number } {
	const applySet = (
		target: { rounds: RoundLike[]; currentRound: number },
		obj: Record<string, unknown> | undefined
	) => {
		if (!obj) {
			return;
		}
		if (Object.prototype.hasOwnProperty.call(obj, 'rounds')) {
			const r = obj.rounds;
			target.rounds = Array.isArray(r) ? (r as RoundLike[]).map((x) => ({ ...x })) : target.rounds;
		}
		if (Object.prototype.hasOwnProperty.call(obj, 'currentRound')) {
			target.currentRound = obj.currentRound as number;
		}
	};

	const pushRounds = (update as { $push?: { rounds?: unknown } }).$push?.rounds;
	const applyPush = (target: { rounds: RoundLike[] }) => {
		if (pushRounds === undefined) {
			return;
		}
		const p = pushRounds as { $each?: RoundLike[] } | RoundLike;
		if (p && typeof p === 'object' && '$each' in p && Array.isArray(p.$each)) {
			target.rounds = [...target.rounds, ...p.$each];
		} else {
			target.rounds = [...target.rounds, p as RoundLike];
		}
	};

	if (existing) {
		const state = {
			rounds: Array.isArray(existing.rounds) ? existing.rounds.map((x) => ({ ...x })) : [],
			currentRound: existing.currentRound ?? 0
		};
		applySet(state, update.$set as Record<string, unknown> | undefined);
		applyPush(state);
		return state;
	}

	const state = {
		rounds: [] as RoundLike[],
		currentRound: 0
	};
	applySet(state, update.$setOnInsert as Record<string, unknown> | undefined);
	applySet(state, update.$set as Record<string, unknown> | undefined);
	applyPush(state);
	return state;
}

function throwScheduleInvariantValidationError(path: 'rounds' | 'currentRound', message: string) {
	const err = new mongoose.Error.ValidationError();
	err.addError(
		path,
		new mongoose.Error.ValidatorError({
			path,
			message,
			type: 'schedule.invariant',
			value: undefined
		})
	);
	throw err;
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
			min: [1, 'slot must be at least 1'],
			validate: {
				validator: Number.isInteger,
				message: 'slot must be an integer'
			}
		},
		round: {
			type: Number,
			required: true,
			min: [1, 'round must be at least 1'],
			validate: {
				validator: Number.isInteger,
				message: 'round must be an integer'
			}
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
			min: [0, 'currentRound must be a non-negative number'],
			validate: {
				validator: Number.isInteger,
				message: 'currentRound must be an integer'
			}
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

scheduleSchema.pre('validate', function () {
	validateScheduleRoundsInvariants(this.rounds, this.currentRound, (path, message) =>
		this.invalidate(path, message)
	);
});

scheduleSchema.pre('findOneAndUpdate', async function () {
	const rawUpdate = this.getUpdate();
	if (!rawUpdate || typeof rawUpdate !== 'object') {
		return;
	}
	const update = rawUpdate as Record<string, unknown>;
	if (!updateTouchesRoundsOrCurrentRound(update)) {
		return;
	}

	const existing = await this.model
		.findOne(this.getFilter())
		.select('rounds currentRound')
		.lean<Pick<ISchedule, 'rounds' | 'currentRound'> | null>()
		.exec();

	const { rounds, currentRound } = simulateScheduleAfterFindOneAndUpdate(
		existing,
		rawUpdate as UpdateQuery<ISchedule>
	);

	validateScheduleRoundsInvariants(rounds, currentRound, (path, message) =>
		throwScheduleInvariantValidationError(path, message)
	);
});

const Schedule = mongoose.model<ISchedule>('Schedule', scheduleSchema);

export default Schedule;
