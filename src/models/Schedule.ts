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
	const hasTopLevelReplacementField = Object.keys(update).some((key) => !key.startsWith('$'));
	if (hasTopLevelReplacementField && ('rounds' in update || 'currentRound' in update)) {
		return true;
	}

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
	const addToSet = update.$addToSet;
	if (addToSet && typeof addToSet === 'object' && 'rounds' in (addToSet as Record<string, unknown>)) {
		return true;
	}
	const pull = update.$pull;
	if (pull && typeof pull === 'object' && 'rounds' in (pull as Record<string, unknown>)) {
		return true;
	}
	const unset = update.$unset;
	if (unset && typeof unset === 'object' && 'currentRound' in (unset as Record<string, unknown>)) {
		return true;
	}
	const inc = update.$inc;
	if (inc && typeof inc === 'object' && 'currentRound' in (inc as Record<string, unknown>)) {
		return true;
	}
	return false;
}

function simulateScheduleAfterFindOneAndUpdate(
	existing: Pick<ISchedule, 'rounds' | 'currentRound'> | null,
	update: UpdateQuery<ISchedule>
): { rounds: RoundLike[]; currentRound: number } {
	const isPlainObject = (value: unknown): value is Record<string, unknown> =>
		typeof value === 'object' && value !== null && !Array.isArray(value);

	const deepEqual = (a: unknown, b: unknown): boolean => {
		if (a === b) {
			return true;
		}
		if (Array.isArray(a) && Array.isArray(b)) {
			if (a.length !== b.length) {
				return false;
			}
			return a.every((item, index) => deepEqual(item, b[index]));
		}
		if (isPlainObject(a) && isPlainObject(b)) {
			const aKeys = Object.keys(a);
			const bKeys = Object.keys(b);
			if (aKeys.length !== bKeys.length) {
				return false;
			}
			return aKeys.every((key) => deepEqual(a[key], b[key]));
		}
		return false;
	};

	const matchesPullCriteria = (entry: RoundLike, criteria: unknown): boolean => {
		if (isPlainObject(criteria)) {
			if ('$in' in criteria && Array.isArray(criteria.$in)) {
				return criteria.$in.some((candidate) => deepEqual(entry, candidate));
			}
			return Object.entries(criteria).every(([key, value]) =>
				deepEqual((entry as Record<string, unknown>)[key], value)
			);
		}
		return deepEqual(entry, criteria);
	};

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

	const addToSetRounds = (update as { $addToSet?: { rounds?: unknown } }).$addToSet?.rounds;
	const applyAddToSet = (target: { rounds: RoundLike[] }) => {
		if (addToSetRounds === undefined) {
			return;
		}
		const candidate =
			isPlainObject(addToSetRounds) && '$each' in addToSetRounds
				? (addToSetRounds.$each as unknown[])
				: [addToSetRounds];
		for (const item of candidate) {
			if (!target.rounds.some((entry) => deepEqual(entry, item))) {
				target.rounds = [...target.rounds, item as RoundLike];
			}
		}
	};

	const pullRounds = (update as { $pull?: { rounds?: unknown } }).$pull?.rounds;
	const applyPull = (target: { rounds: RoundLike[] }) => {
		if (pullRounds === undefined) {
			return;
		}
		target.rounds = target.rounds.filter((entry) => !matchesPullCriteria(entry, pullRounds));
	};

	const unset = update.$unset as Record<string, unknown> | undefined;
	const applyUnset = (target: { currentRound: number }) => {
		if (!unset) {
			return;
		}
		if (Object.prototype.hasOwnProperty.call(unset, 'currentRound')) {
			target.currentRound = 0;
		}
	};

	const inc = update.$inc as Record<string, unknown> | undefined;
	const applyInc = (target: { currentRound: number }) => {
		if (!inc || !Object.prototype.hasOwnProperty.call(inc, 'currentRound')) {
			return;
		}
		const incrementBy = inc.currentRound;
		if (typeof incrementBy === 'number') {
			target.currentRound += incrementBy;
		}
	};

	const hasTopLevelReplacementField = Object.keys(update).some((key) => !key.startsWith('$'));
	const applyReplacement = () => {
		const replacement = update as Record<string, unknown>;
		return {
			rounds: Array.isArray(replacement.rounds) ? (replacement.rounds as RoundLike[]).map((x) => ({ ...x })) : [],
			currentRound: typeof replacement.currentRound === 'number' ? replacement.currentRound : 0
		};
	};

	if (hasTopLevelReplacementField) {
		return applyReplacement();
	}

	if (existing) {
		const state = {
			rounds: Array.isArray(existing.rounds) ? existing.rounds.map((x) => ({ ...x })) : [],
			currentRound: existing.currentRound ?? 0
		};
		applySet(state, update.$set as Record<string, unknown> | undefined);
		applyPush(state);
		applyAddToSet(state);
		applyPull(state);
		applyUnset(state);
		applyInc(state);
		return state;
	}

	const state = {
		rounds: [] as RoundLike[],
		currentRound: 0
	};
	applySet(state, update.$setOnInsert as Record<string, unknown> | undefined);
	applySet(state, update.$set as Record<string, unknown> | undefined);
	applyPush(state);
	applyAddToSet(state);
	applyPull(state);
	applyUnset(state);
	applyInc(state);
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

	const session = this.getOptions().session;
	let existingQuery = this.model.findOne(this.getFilter());
	if (session) {
		existingQuery = existingQuery.session(session);
	}
	const existing = await existingQuery
		.select('rounds currentRound __v')
		.lean<(Pick<ISchedule, 'rounds' | 'currentRound'> & { __v: number }) | null>()
		.exec();
	if (existing) {
		this.setQuery({ ...this.getFilter(), __v: existing.__v });
	}

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
