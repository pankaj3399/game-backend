import { ZodError, ZodIssueCode } from 'zod';
import { AppError, buildErrorPayload, buildZodErrorPayload } from '../errors';

describe('AppError', () => {
  it('stores the message', () => {
    const err = new AppError('Something went wrong');
    expect(err.message).toBe('Something went wrong');
  });

  it('has name "AppError"', () => {
    expect(new AppError('fail').name).toBe('AppError');
  });

  it('defaults statusCode to 500', () => {
    expect(new AppError('fail').statusCode).toBe(500);
  });

  it('stores a custom statusCode', () => {
    expect(new AppError('not found', 404).statusCode).toBe(404);
  });

  it('stores optional details', () => {
    const details = { field: 'email' };
    expect(new AppError('bad', 400, details).details).toStrictEqual(details);
  });

  it('details is undefined when not provided', () => {
    expect(new AppError('bad', 400).details).toBeUndefined();
  });

  it('is an instance of Error', () => {
    expect(new AppError('x')).toBeInstanceOf(Error);
  });
});

describe('buildErrorPayload()', () => {
  it('returns the message', () => {
    expect(buildErrorPayload('Unauthorized').message).toBe('Unauthorized');
  });

  it('sets error: true', () => {
    expect(buildErrorPayload('x').error).toBe(true);
  });
});

describe('buildZodErrorPayload()', () => {
  function makeZodError(messages: string[]): ZodError {
    return new ZodError(
      messages.map((msg, i) => ({
        code: ZodIssueCode.custom,
        message: msg,
        path: [i],
      }))
    );
  }

  it('joins multiple issue messages with "; "', () => {
    const err = makeZodError(['Field A required', 'Field B invalid']);
    expect(buildZodErrorPayload(err).message).toBe('Field A required; Field B invalid');
  });

  it('handles a single issue', () => {
    const err = makeZodError(['Email is required']);
    expect(buildZodErrorPayload(err).message).toBe('Email is required');
  });

  it('sets error: true on the payload', () => {
    expect(buildZodErrorPayload(makeZodError(['x'])).error).toBe(true);
  });
});
