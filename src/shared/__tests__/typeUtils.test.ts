import { Types } from 'mongoose';
import {
	finiteNumberOr,
	isDbIdLike,
	isPlainObject,
	resolveDbIdRef,
} from '../typeUtils';

describe('typeUtils', () => {
	it('isPlainObject distinguishes objects from arrays', () => {
		expect(isPlainObject({ a: 1 })).toBe(true);
		expect(isPlainObject([])).toBe(false);
		expect(isPlainObject(null)).toBe(false);
	});

	it('isDbIdLike accepts strings and ObjectIds', () => {
		expect(isDbIdLike('507f1f77bcf86cd799439011')).toBe(true);
		expect(isDbIdLike(new Types.ObjectId())).toBe(true);
		expect(isDbIdLike(42)).toBe(false);
	});

	it('resolveDbIdRef reads populated _id or raw id', () => {
		const oid = new Types.ObjectId();
		expect(resolveDbIdRef({ _id: oid })).toEqual(oid);
		expect(resolveDbIdRef(oid)).toEqual(oid);
		expect(resolveDbIdRef({ _id: null })).toBeNull();
	});

	it('finiteNumberOr returns fallback for non-finite values', () => {
		expect(finiteNumberOr(10, 0)).toBe(10);
		expect(finiteNumberOr(undefined, 5)).toBe(5);
		expect(finiteNumberOr(Number.NaN, 3)).toBe(3);
	});
});
