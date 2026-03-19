import { z } from 'zod';
import { guardObjectId } from '../../../shared/guards';
import { error, ok } from '../../../shared/helpers';

export function readRouteParam(value: string | string[] | undefined) {
	if (Array.isArray(value)) {
		return value[0];
	}
	return value;
}

export function parseRouteObjectId(value: string | string[] | undefined, fieldName: string) {
	return guardObjectId(readRouteParam(value), fieldName);
}

export function parseBodyWithSchema<TSchema extends z.ZodTypeAny>(schema: TSchema, payload: unknown) {
	const parsed = schema.safeParse(payload);
	if (!parsed.success) {
		return error(400, parsed.error.issues.map((issue) => issue.message).join('; '));
	}

	return ok(parsed.data, { status: 200, message: 'Valid request body' });
}
