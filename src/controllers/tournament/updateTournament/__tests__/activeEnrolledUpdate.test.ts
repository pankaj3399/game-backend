import { Types } from 'mongoose';
import { validateActiveTournamentEnrolledUpdate } from '../activeEnrolledUpdate';

// ── helpers ──────────────────────────────────────────────────────────────────

type TournamentStub = Parameters<typeof validateActiveTournamentEnrolledUpdate>[0];
type DataStub = Parameters<typeof validateActiveTournamentEnrolledUpdate>[1];

function makeTournament(overrides: Partial<TournamentStub> = {}): TournamentStub {
  return {
    _id: new Types.ObjectId(),
    status: 'active',
    participants: [new Types.ObjectId()], // 1 enrolled
    date: new Date('2024-09-01'),
    startTime: '09:00',
    endTime: '18:00',
    maxMember: 16,
    ...overrides,
  } as unknown as TournamentStub;
}

function makeData(overrides: Partial<DataStub> = {}): DataStub {
  return { ...overrides } as DataStub;
}

// ── Bypass conditions ─────────────────────────────────────────────────────────

describe('validateActiveTournamentEnrolledUpdate() — bypass conditions', () => {
  it('returns ok when tournament status is not "active"', () => {
    const t = makeTournament({ status: 'draft' } as any);
    const result = validateActiveTournamentEnrolledUpdate(t, makeData());
    expect(result.ok).toBe(true);
  });

  it('returns ok when active but zero participants', () => {
    const t = makeTournament({ participants: [], participantCount: 0 });
    const result = validateActiveTournamentEnrolledUpdate(t as any, makeData());
    expect(result.ok).toBe(true);
  });

  it('uses participantCount when provided (avoids array.length)', () => {
    const t = makeTournament({ participantCount: 0, participants: undefined });
    const result = validateActiveTournamentEnrolledUpdate(t as any, makeData());
    expect(result.ok).toBe(true);
  });
});

// ── Date change guard ─────────────────────────────────────────────────────────

describe('validateActiveTournamentEnrolledUpdate() — date change', () => {
  it('returns error 400 when date changes on an active enrolled tournament', () => {
    const t = makeTournament();
    const result = validateActiveTournamentEnrolledUpdate(
      t,
      makeData({ date: new Date('2024-10-01') }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.message).toContain('date');
    }
  });

  it('returns ok when date is the same (no real change)', () => {
    const t = makeTournament({ date: new Date('2024-09-01') });
    const result = validateActiveTournamentEnrolledUpdate(
      t,
      makeData({ date: new Date('2024-09-01') }),
    );
    expect(result.ok).toBe(true);
  });

  it('returns ok when date is not provided in the update payload', () => {
    const t = makeTournament();
    const result = validateActiveTournamentEnrolledUpdate(t, makeData({ date: undefined }));
    expect(result.ok).toBe(true);
  });
});

// ── Start time guard ──────────────────────────────────────────────────────────

describe('validateActiveTournamentEnrolledUpdate() — startTime change', () => {
  it('returns error 400 when startTime changes', () => {
    const t = makeTournament({ startTime: '09:00' });
    const result = validateActiveTournamentEnrolledUpdate(t, makeData({ startTime: '10:00' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(400);
  });

  it('returns ok when startTime is the same', () => {
    const t = makeTournament({ startTime: '09:00' });
    const result = validateActiveTournamentEnrolledUpdate(t, makeData({ startTime: '09:00' }));
    expect(result.ok).toBe(true);
  });
});

// ── End time guard ────────────────────────────────────────────────────────────

describe('validateActiveTournamentEnrolledUpdate() — endTime change', () => {
  it('returns error 400 when endTime changes', () => {
    const t = makeTournament({ endTime: '18:00' });
    const result = validateActiveTournamentEnrolledUpdate(t, makeData({ endTime: '19:00' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(400);
  });

  it('treats null and undefined endTime as equivalent (no change)', () => {
    const t = makeTournament({ endTime: null });
    const result = validateActiveTournamentEnrolledUpdate(t, makeData({ endTime: undefined }));
    // data.endTime is undefined → field omitted → no change check
    expect(result.ok).toBe(true);
  });
});

// ── maxMember guard ───────────────────────────────────────────────────────────

describe('validateActiveTournamentEnrolledUpdate() — maxMember', () => {
  it('returns error 400 when new maxMember is below current enrollment', () => {
    // 1 participant enrolled, maxMember → 0
    const t = makeTournament({ participants: [new Types.ObjectId()] });
    const result = validateActiveTournamentEnrolledUpdate(t, makeData({ maxMember: 0 }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.message).toContain('maxMember');
    }
  });

  it('returns ok when maxMember equals enrollment', () => {
    const t = makeTournament({ participants: [new Types.ObjectId()], participantCount: 1 });
    const result = validateActiveTournamentEnrolledUpdate(t, makeData({ maxMember: 1 }));
    expect(result.ok).toBe(true);
  });

  it('returns ok when maxMember is not provided (keeps current)', () => {
    const t = makeTournament({ maxMember: 16 });
    const result = validateActiveTournamentEnrolledUpdate(t, makeData());
    expect(result.ok).toBe(true);
  });

  it('returns ok when existing maxMember is undefined (no cap)', () => {
    const t = makeTournament({ maxMember: undefined });
    const result = validateActiveTournamentEnrolledUpdate(t, makeData());
    expect(result.ok).toBe(true);
  });
});
