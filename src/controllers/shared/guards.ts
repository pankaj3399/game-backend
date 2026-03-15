import {
	idParamSchema,
	objectIdFor,
} from '../../validation/base-helpers';
import { error,ok } from './helpers';

export const objectIdSchema = objectIdFor;

export function guardObjectId(id: string | undefined, fieldName: string = 'ID') {
	const parsed = objectIdFor(fieldName).safeParse(id);
	if (!parsed.success) {
		return error(400, `Invalid ${fieldName}`);
	}
	return ok(parsed.data);
}

export function guardIdParam(params: { id?: string }, fieldName: string = 'ID') {
	const parsed = idParamSchema(fieldName).safeParse(params);
	if (!parsed.success) {
		return error(400, `Invalid ${fieldName}`);
	}
	return ok(parsed.data.id);
}

export function guardEntityFound<T>(entity: T | null | undefined): entity is T {
	return entity != null;
}
