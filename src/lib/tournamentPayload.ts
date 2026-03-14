import mongoose from 'mongoose';

type DbPayload = Record<string, unknown>;
type DbObjectId = mongoose.Types.ObjectId;
type RoundTimingInput = { startDate?: Date | string | null; endDate?: Date | string | null };

const hasOwn = (obj: DbPayload, key: string): boolean =>
	Object.prototype.hasOwnProperty.call(obj, key);

const isExplicitClear = (value: unknown): boolean =>
	value == null || (typeof value === 'string' && value.trim() === '');

const toNullableDate = (value: unknown): Date | null | unknown => {
	if (isExplicitClear(value)) return null;
	if (typeof value !== 'string') return value;

	const parsed = new Date(value);
	return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const toNullableObjectId = (value: unknown): DbObjectId | null | unknown => {
	if (isExplicitClear(value)) return null;
	if (typeof value !== 'string') return value;

	return new mongoose.Types.ObjectId(value);
};

const toOptionalDate = (value: Date | string | null | undefined): Date | undefined => {
	if (!value) return undefined;
	const parsed = value instanceof Date ? value : new Date(value);
	return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

export function toDbPayload(
	data: DbPayload,
	options?: { status?: string }
) {
	const payload: DbPayload = { ...data };

	if (hasOwn(payload, 'date')) payload.date = toNullableDate(payload.date);
	if (hasOwn(payload, 'club')) payload.club = toNullableObjectId(payload.club);
	if (hasOwn(payload, 'sponsorId')) payload.sponsorId = toNullableObjectId(payload.sponsorId);

	if (Array.isArray(payload.courts)) {
		payload.courts = (payload.courts as string[]).map(
			(cid) => new mongoose.Types.ObjectId(cid)
		);
	}

	if (Array.isArray(payload.roundTimings)) {
		payload.roundTimings = (
			payload.roundTimings as RoundTimingInput[]
		).map((r) => ({
			startDate: toOptionalDate(r.startDate),
			endDate: toOptionalDate(r.endDate)
		}));
	}

	if (options?.status !== undefined) {
		payload.status = options.status;
	} else {
		delete payload.status;
	}

	return payload;
}