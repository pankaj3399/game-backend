import { isDuplicateKeyError } from '../mongoErrors';

describe('isDuplicateKeyError()', () => {
  it('returns true for a MongoServerError with code 11000', () => {
    expect(isDuplicateKeyError({ code: 11000, name: 'MongoServerError' })).toBe(true);
  });

  it('returns true for a legacy MongoError with code 11000', () => {
    expect(isDuplicateKeyError({ code: 11000, name: 'MongoError' })).toBe(true);
  });

  it('returns false when code is 11000 but name is something else', () => {
    expect(isDuplicateKeyError({ code: 11000, name: 'OtherError' })).toBe(false);
  });

  it('returns false when name matches but code is different', () => {
    expect(isDuplicateKeyError({ code: 11001, name: 'MongoServerError' })).toBe(false);
  });

  it('returns false for a plain Error object', () => {
    expect(isDuplicateKeyError(new Error('something'))).toBe(false);
  });

  it('returns false for null', () => {
    expect(isDuplicateKeyError(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isDuplicateKeyError(undefined)).toBe(false);
  });

  it('returns false for an empty object', () => {
    expect(isDuplicateKeyError({})).toBe(false);
  });

  it('returns false for a string', () => {
    expect(isDuplicateKeyError('MongoServerError')).toBe(false);
  });
});
