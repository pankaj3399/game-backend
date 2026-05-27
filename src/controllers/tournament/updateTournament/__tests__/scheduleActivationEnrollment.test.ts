import type { TournamentForUpdateAuth } from '../../../../types/api';
import type { UpdateTournamentPersistenceInput } from '../validation';
import { validateScheduleActivationEnrollment } from '../scheduleActivationEnrollment';

// ── helpers ──────────────────────────────────────────────────────────────────

type TournamentStub = {
  tournamentMode: string;
  status: string;
  participants: Array<unknown>;
  date: Date | null;
  startTime: string | null;
  endTime: string | null;
  timezone: string | null;
  minMember: number;
};

function makeTournament(overrides: Partial<TournamentStub> = {}): TournamentForUpdateAuth {
  return {
    tournamentMode: 'singleDay',
    status: 'active',
    participants: [],
    date: new Date('2025-06-01T00:00:00Z'),
    startTime: '09:00',
    endTime: '17:00',
    timezone: 'UTC',
    minMember: 2,
    ...overrides,
  } as unknown as TournamentForUpdateAuth;
}

/** Cast a partial schedule payload to the full input type for test purposes. */
function persistenceInput(partial: Record<string, unknown> = {}): UpdateTournamentPersistenceInput {
  return partial as unknown as UpdateTournamentPersistenceInput;
}

// ── ok when status is not "active" ────────────────────────────────────────────

describe('validateScheduleActivationEnrollment() — status bypass', () => {
  it('returns ok immediately when next status is not "active"', () => {
    const tournament = makeTournament({ status: 'active' });
    const result = validateScheduleActivationEnrollment(tournament, persistenceInput({ status: 'inactive' }));
    expect(result.ok).toBe(true);
  });

  it('returns ok immediately when data has no status and tournament is inactive', () => {
    const tournament = makeTournament({ status: 'inactive' });
    const result = validateScheduleActivationEnrollment(tournament, persistenceInput({}));
    expect(result.ok).toBe(true);
  });
});

// ── ok when no participants are enrolled ─────────────────────────────────────

describe('validateScheduleActivationEnrollment() — empty participants bypass', () => {
  it('returns ok when no participants are enrolled (regardless of schedule)', () => {
    const tournament = makeTournament({
      participants: [],
      status: 'active',
      tournamentMode: 'singleDay',
    });
    const result = validateScheduleActivationEnrollment(
      tournament,
      persistenceInput({ date: new Date('2025-07-01T00:00:00Z'), startTime: '09:00', endTime: '17:00', timezone: 'UTC' })
    );
    expect(result.ok).toBe(true);
  });
});

// ── ok when schedule was already fully scheduled (no transition) ─────────────

describe('validateScheduleActivationEnrollment() — no transition', () => {
  it('returns ok when tournament was already fully scheduled before update', () => {
    const tournament = makeTournament({
      status: 'active',
      participants: [{}],
      tournamentMode: 'singleDay',
      date: new Date('2025-06-01T00:00:00Z'),
      startTime: '09:00',
      endTime: '17:00',
      timezone: 'UTC',
      minMember: 2,
    });
    // Data preserves the same schedule — no transition → ok
    const result = validateScheduleActivationEnrollment(
      tournament,
      persistenceInput({ startTime: '09:00', endTime: '17:00' })
    );
    expect(result.ok).toBe(true);
  });

  it('returns ok when tournament was not scheduled before and is still not scheduled after', () => {
    const tournament = makeTournament({
      status: 'active',
      participants: [{}],
      tournamentMode: 'singleDay',
      date: null,
      startTime: null,
      endTime: null,
    });
    // Stays unscheduled → ok
    const result = validateScheduleActivationEnrollment(tournament, persistenceInput({}));
    expect(result.ok).toBe(true);
  });
});

// ── error on first-time schedule activation with insufficient enrollment ─────

describe('validateScheduleActivationEnrollment() — enrollment gate', () => {
  it('returns error when transitioning to scheduled with fewer participants than minMember', () => {
    const tournament = makeTournament({
      status: 'active',
      participants: [{}], // 1 participant
      tournamentMode: 'singleDay',
      date: null,          // was NOT scheduled before
      startTime: null,
      endTime: null,
      timezone: null,
      minMember: 4,
    });

    const result = validateScheduleActivationEnrollment(
      tournament,
      persistenceInput({ date: new Date('2025-07-01T00:00:00Z'), startTime: '09:00', endTime: '17:00', timezone: 'UTC' })
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.message).toContain('4');
      expect(result.message).toContain('1');
    }
  });

  it('returns ok when participant count exactly meets minMember on first schedule', () => {
    const tournament = makeTournament({
      status: 'active',
      participants: [{}, {}], // 2 participants
      tournamentMode: 'singleDay',
      date: null,
      startTime: null,
      endTime: null,
      timezone: null,
      minMember: 2,
    });

    const result = validateScheduleActivationEnrollment(
      tournament,
      persistenceInput({ date: new Date('2025-07-01T00:00:00Z'), startTime: '09:00', endTime: '17:00', timezone: 'UTC' })
    );

    expect(result.ok).toBe(true);
  });

  it('returns ok when participant count exceeds minMember on first schedule', () => {
    const tournament = makeTournament({
      status: 'active',
      participants: [{}, {}, {}], // 3 participants
      tournamentMode: 'singleDay',
      date: null,
      startTime: null,
      endTime: null,
      timezone: null,
      minMember: 2,
    });

    const result = validateScheduleActivationEnrollment(
      tournament,
      persistenceInput({ date: new Date('2025-07-01T00:00:00Z'), startTime: '09:00', endTime: '17:00', timezone: 'UTC' })
    );

    expect(result.ok).toBe(true);
  });

  it('uses data.minMember when provided (override takes precedence over tournament.minMember)', () => {
    const tournament = makeTournament({
      status: 'active',
      participants: [{}, {}], // 2 participants
      tournamentMode: 'singleDay',
      date: null,
      startTime: null,
      endTime: null,
      timezone: null,
      minMember: 2,
    });

    // Data raises minMember to 8 — now 2 participants is insufficient
    const result = validateScheduleActivationEnrollment(
      tournament,
      persistenceInput({ date: new Date('2025-07-01T00:00:00Z'), startTime: '09:00', endTime: '17:00', timezone: 'UTC', minMember: 8 })
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('8');
    }
  });

  it('returns ok for a non-singleDay tournament even if schedule fields are provided', () => {
    const tournament = makeTournament({
      status: 'active',
      participants: [{}], // 1 participant < minMember=4
      tournamentMode: 'league',
      date: null,
      startTime: null,
      endTime: null,
      minMember: 4,
    });

    // Non-singleDay tournaments don't qualify as "fully scheduled single-day" → no gate
    const result = validateScheduleActivationEnrollment(
      tournament,
      persistenceInput({ date: new Date('2025-07-01T00:00:00Z'), startTime: '09:00', endTime: '17:00' })
    );

    expect(result.ok).toBe(true);
  });

  it('returns error mentioning the current enrolled count in the message', () => {
    const tournament = makeTournament({
      status: 'active',
      participants: [{}, {}],
      tournamentMode: 'singleDay',
      date: null,
      startTime: null,
      endTime: null,
      timezone: null,
      minMember: 10,
    });

    const result = validateScheduleActivationEnrollment(
      tournament,
      persistenceInput({ date: new Date('2025-07-01T00:00:00Z'), startTime: '09:00', endTime: '17:00', timezone: 'UTC' })
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      // Message should reference both the required count (10) and the current count (2)
      expect(result.message).toContain('10');
      expect(result.message).toContain('2');
    }
  });
});
