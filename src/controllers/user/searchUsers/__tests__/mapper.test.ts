import { Types } from 'mongoose';
import { mapSearchUsersResponse } from '../mapper';

describe('mapSearchUsersResponse()', () => {
  function makeUser(overrides: { name?: string | null; alias?: string | null } = {}) {
    return {
      _id: new Types.ObjectId(),
      email: 'user@example.com',
      name: 'name' in overrides ? overrides.name! : 'Test User',
      alias: 'alias' in overrides ? overrides.alias! : null,
    };
  }

  it('maps a user to id, email, name, and alias', () => {
    const user = makeUser({ name: 'Alice', alias: 'ace' });
    const result = mapSearchUsersResponse([user]);
    expect(result.users).toHaveLength(1);
    const mapped = result.users[0];
    expect(mapped.id).toBe(user._id.toString());
    expect(mapped.email).toBe('user@example.com');
    expect(mapped.name).toBe('Alice');
    expect(mapped.alias).toBe('ace');
  });

  it('coerces null name to null (not undefined)', () => {
    const user = makeUser({ name: null });
    const result = mapSearchUsersResponse([user]);
    expect(result.users[0].name).toBeNull();
  });

  it('coerces null alias to null', () => {
    const user = makeUser({ alias: null });
    const result = mapSearchUsersResponse([user]);
    expect(result.users[0].alias).toBeNull();
  });

  it('returns an empty users array when given no users', () => {
    expect(mapSearchUsersResponse([]).users).toEqual([]);
  });

  it('maps multiple users in order', () => {
    const u1 = makeUser({ name: 'Alice' });
    const u2 = makeUser({ name: 'Bob' });
    u2.email = 'bob@example.com';
    const result = mapSearchUsersResponse([u1, u2]);
    expect(result.users[0].name).toBe('Alice');
    expect(result.users[1].name).toBe('Bob');
  });
});
