import { ok, error } from '../helpers';

describe('ok()', () => {
  it('sets ok: true', () => {
    expect(ok({ id: 1 }).ok).toBe(true);
  });

  it('defaults status to 200', () => {
    expect(ok({}).status).toBe(200);
  });

  it('defaults message to "Success"', () => {
    expect(ok({}).message).toBe('Success');
  });

  it('passes through custom status', () => {
    expect(ok({}, { status: 201 }).status).toBe(201);
  });

  it('passes through custom message', () => {
    expect(ok({}, { message: 'Created' }).message).toBe('Created');
  });

  it('stores data on the result', () => {
    const data = { name: 'Alice', score: 42 };
    expect(ok(data).data).toStrictEqual(data);
  });

  it('works with null data', () => {
    expect(ok(null).data).toBeNull();
  });
});

describe('error()', () => {
  it('sets ok: false', () => {
    expect(error(400, 'Bad request').ok).toBe(false);
  });

  it('stores the status code', () => {
    expect(error(404, 'Not found').status).toBe(404);
    expect(error(500, 'Server error').status).toBe(500);
  });

  it('stores the message', () => {
    expect(error(422, 'Unprocessable').message).toBe('Unprocessable');
  });

  it('does not include a data field', () => {
    const result = error(400, 'Bad request') as Record<string, unknown>;
    expect(result.data).toBeUndefined();
  });
});
