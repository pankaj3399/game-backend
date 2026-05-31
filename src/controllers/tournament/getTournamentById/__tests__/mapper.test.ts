import { Types } from 'mongoose';
import {
  mapTournamentDetail,
} from '../mapper';
import type { TournamentPopulated } from '../../../../types/api/tournament';
import type { DetailViewContext } from '../../shared/authorizeGetById';
import { ROLES } from '../../../../constants/roles';

// ── helpers ──────────────────────────────────────────────────────────────────

function makeId(): string {
  return new Types.ObjectId().toHexString();
}

function makeParticipant(overrides: Partial<{ _id: string; name: string; alias: string | null; profilePictureUrl: string | null }> = {}) {
  return {
    _id: overrides._id ?? makeId(),
    name: overrides.name ?? 'Alice',
    alias: 'alias' in overrides ? overrides.alias : null,
    profilePictureUrl: 'profilePictureUrl' in overrides ? overrides.profilePictureUrl : null,
  };
}

type TournamentPartial = Partial<TournamentPopulated>;

function makeTournament(overrides: TournamentPartial = {}): TournamentPopulated {
  const id = makeId();
  return {
    _id: id,
    name: 'Test Tournament',
    logoUrl: null,
    playMode: '1set',
    tournamentMode: 'singleDay',
    entryFee: 0,
    minMember: 2,
    maxMember: 8,
    totalRounds: 3,
    duration: 60,
    breakDuration: 10,
    foodInfo: '',
    descriptionInfo: '',
    status: 'active',
    participants: [],
    doublesPairs: {},
    timezone: 'UTC',
    startTime: '09:00',
    endTime: '17:00',
    date: new Date('2025-06-01T00:00:00Z'),
    club: null,
    sponsor: null,
    courts: [],
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-02T00:00:00Z'),
    completedAt: null,
    ...overrides,
  } as unknown as TournamentPopulated;
}

function makeContext(overrides: Partial<DetailViewContext> = {}): DetailViewContext {
  return {
    isCreator: false,
    role: ROLES.PLAYER,
    ...overrides,
  } as DetailViewContext;
}

const sessionUserId = makeId();

// ── mapTournamentDetail – basic output shape ──────────────────────────────────

describe('mapTournamentDetail()', () => {
  it('returns expected top-level fields for a basic tournament', () => {
    const tournament = makeTournament();
    const result = mapTournamentDetail(tournament, makeContext(), [], sessionUserId);

    expect(result.id).toBe(String(tournament._id));
    expect(result.name).toBe('Test Tournament');
    expect(result.status).toBe('active');
    expect(result.playMode).toBe('1set');
    expect(result.tournamentMode).toBe('singleDay');
    expect(result.entryFee).toBe(0);
    expect(result.totalRounds).toBe(3);
    expect(result.duration).toBe(60);
    expect(result.breakDuration).toBe(10);
  });

  it('throws when tournament is null/undefined', () => {
    expect(() =>
      mapTournamentDetail(null as unknown as TournamentPopulated, makeContext(), [], sessionUserId)
    ).toThrow('Invalid tournament data: missing tournament');
  });

  it('throws when tournament._id is missing', () => {
    const tournament = makeTournament({ _id: undefined });
    expect(() =>
      mapTournamentDetail(tournament, makeContext(), [], sessionUserId)
    ).toThrow('Invalid tournament data: missing _id');
  });

  // ── participants ──────────────────────────────────────────────────────────

  it('maps participants correctly', () => {
    const p1 = makeParticipant({ name: 'Alice', alias: 'ali' });
    const p2 = makeParticipant({ name: 'Bob', alias: null });
    const tournament = makeTournament({ participants: [p1, p2] as unknown as TournamentPopulated['participants'] });

    const result = mapTournamentDetail(tournament, makeContext(), [], sessionUserId);

    expect(result.participants).toHaveLength(2);
    expect(result.participants[0].name).toBe('Alice');
    expect(result.participants[0].alias).toBe('ali');
    expect(result.participants[1].name).toBe('Bob');
    expect(result.participants[1].alias).toBeNull();
  });

  it('skips participants with no valid _id', () => {
    const validParticipant = makeParticipant();
    const invalidParticipant = { _id: '', name: 'Ghost' };
    const tournament = makeTournament({ participants: [validParticipant, invalidParticipant] as unknown as TournamentPopulated['participants'] });

    const result = mapTournamentDetail(tournament, makeContext(), [], sessionUserId);
    expect(result.participants).toHaveLength(1);
  });

  // ── progress ─────────────────────────────────────────────────────────────

  it('computes progress correctly for 4 out of 8 spots', () => {
    const participants = Array.from({ length: 4 }, () => makeParticipant());
    const tournament = makeTournament({ participants: participants as unknown as TournamentPopulated['participants'], maxMember: 8 });

    const result = mapTournamentDetail(tournament, makeContext(), [], sessionUserId);
    expect(result.progress.spotsFilled).toBe(4);
    expect(result.progress.spotsTotal).toBe(8);
    expect(result.progress.percentage).toBe(50);
  });

  it('returns 0% progress when no participants', () => {
    const tournament = makeTournament({ participants: [], maxMember: 8 });
    const result = mapTournamentDetail(tournament, makeContext(), [], sessionUserId);
    expect(result.progress.percentage).toBe(0);
    expect(result.progress.spotsFilled).toBe(0);
  });

  it('handles missing maxMember gracefully (defaults spotsTotal to 1)', () => {
    const tournament = makeTournament({ maxMember: undefined });
    const result = mapTournamentDetail(tournament, makeContext(), [], sessionUserId);
    expect(result.progress.spotsTotal).toBeGreaterThanOrEqual(1);
  });

  // ── permissions ──────────────────────────────────────────────────────────

  it('canEdit is true when context.isCreator is true', () => {
    const tournament = makeTournament({ status: 'active' });
    const result = mapTournamentDetail(tournament, makeContext({ isCreator: true }), [], makeId());
    expect(result.permissions.canEdit).toBe(true);
  });

  it('canEdit is true when context.role is SUPER_ADMIN', () => {
    const tournament = makeTournament({ status: 'active' });
    const result = mapTournamentDetail(tournament, makeContext({ role: ROLES.SUPER_ADMIN }), [], makeId());
    expect(result.permissions.canEdit).toBe(true);
  });

  it('canEdit is false for a regular user who is not the creator', () => {
    const tournament = makeTournament({ status: 'active' });
    const result = mapTournamentDetail(tournament, makeContext({ isCreator: false, role: ROLES.PLAYER }), [], makeId());
    expect(result.permissions.canEdit).toBe(false);
  });

  it('canJoin is true for active tournament with available spots and non-participant session user', () => {
    const tournament = makeTournament({ status: 'active', maxMember: 8, participants: [] });
    const result = mapTournamentDetail(tournament, makeContext(), [], makeId());
    expect(result.permissions.canJoin).toBe(true);
  });

  it('canJoin is false when tournament is not active', () => {
    const tournament = makeTournament({ status: 'inactive', maxMember: 8 });
    const result = mapTournamentDetail(tournament, makeContext(), [], makeId());
    expect(result.permissions.canJoin).toBe(false);
  });

  it('canJoin is false when session user is already a participant', () => {
    const p = makeParticipant({ _id: sessionUserId });
    const tournament = makeTournament({
      status: 'active',
      maxMember: 8,
      participants: [p] as unknown as TournamentPopulated['participants'],
    });
    const result = mapTournamentDetail(tournament, makeContext(), [], sessionUserId);
    expect(result.permissions.canJoin).toBe(false);
    expect(result.permissions.isParticipant).toBe(true);
  });

  it('canJoin is false when tournament is full', () => {
    const participants = Array.from({ length: 2 }, () => makeParticipant());
    const tournament = makeTournament({
      status: 'active',
      maxMember: 2,
      participants: participants as unknown as TournamentPopulated['participants'],
    });
    const result = mapTournamentDetail(tournament, makeContext(), [], makeId());
    expect(result.permissions.canJoin).toBe(false);
  });

  it('canLeave is true when session user is a participant', () => {
    const p = makeParticipant({ _id: sessionUserId });
    const tournament = makeTournament({
      participants: [p] as unknown as TournamentPopulated['participants'],
    });
    const result = mapTournamentDetail(tournament, makeContext(), [], sessionUserId);
    expect(result.permissions.canLeave).toBe(true);
  });

  it('canLeave is false when session user is not a participant', () => {
    const tournament = makeTournament({ participants: [] });
    const result = mapTournamentDetail(tournament, makeContext(), [], makeId());
    expect(result.permissions.canLeave).toBe(false);
  });

  // ── club / sponsor ────────────────────────────────────────────────────────

  it('returns null club when tournament has no club', () => {
    const tournament = makeTournament({ club: null });
    const result = mapTournamentDetail(tournament, makeContext(), [], sessionUserId);
    expect(result.club).toBeNull();
  });

  it('maps club correctly when present', () => {
    const clubId = makeId();
    const tournament = makeTournament({
      club: { _id: clubId, name: 'Test Club', address: '123 Main St', logoUrl: null, courts: [] } as unknown as TournamentPopulated['club'],
    });
    const result = mapTournamentDetail(tournament, makeContext(), [], sessionUserId);
    expect(result.club).not.toBeNull();
    expect(result.club!.id).toBe(clubId);
    expect(result.club!.name).toBe('Test Club');
    expect(result.club!.address).toBe('123 Main St');
  });

  it('returns null sponsor when tournament has no sponsor', () => {
    const tournament = makeTournament({ sponsor: null });
    const result = mapTournamentDetail(tournament, makeContext(), [], sessionUserId);
    expect(result.sponsor).toBeNull();
  });

  it('maps sponsor correctly when present', () => {
    const sponsorId = makeId();
    const tournament = makeTournament({
      sponsor: { _id: sponsorId, name: 'ACME Corp', logoUrl: 'logo.png', link: 'https://acme.com' } as unknown as TournamentPopulated['sponsor'],
    });
    const result = mapTournamentDetail(tournament, makeContext(), [], sessionUserId);
    expect(result.sponsor).not.toBeNull();
    expect(result.sponsor!.id).toBe(sponsorId);
    expect(result.sponsor!.name).toBe('ACME Corp');
    expect(result.sponsor!.link).toBe('https://acme.com');
  });

  // ── clubSponsors ─────────────────────────────────────────────────────────

  it('maps clubSponsors list correctly', () => {
    const sponsorDoc = { _id: makeId(), name: 'Sponsor A', logoUrl: null, link: null };
    const tournament = makeTournament({});
    const result = mapTournamentDetail(tournament, makeContext(), [sponsorDoc], sessionUserId);
    expect(result.clubSponsors).toHaveLength(1);
    expect(result.clubSponsors[0].name).toBe('Sponsor A');
  });

  it('skips clubSponsors with invalid _id', () => {
    const badSponsor = { _id: '', name: 'Bad' };
    const tournament = makeTournament({});
    const result = mapTournamentDetail(tournament, makeContext(), [badSponsor], sessionUserId);
    expect(result.clubSponsors).toHaveLength(0);
  });

  // ── dates ─────────────────────────────────────────────────────────────────

  it('formats date from UTC date correctly', () => {
    const tournament = makeTournament({ date: new Date('2025-06-15T00:00:00Z'), timezone: 'UTC' });
    const result = mapTournamentDetail(tournament, makeContext(), [], sessionUserId);
    expect(result.date).toBe('2025-06-15');
  });

  it('returns null date when date is not a Date instance', () => {
    const tournament = makeTournament({ date: undefined });
    const result = mapTournamentDetail(tournament, makeContext(), [], sessionUserId);
    expect(result.date).toBeNull();
  });

  it('returns null createdAt when createdAt is not a Date instance', () => {
    const tournament = makeTournament({ createdAt: undefined });
    const result = mapTournamentDetail(tournament, makeContext(), [], sessionUserId);
    expect(result.createdAt).toBeNull();
  });

  it('returns organiserScoreEditDeadline when completedAt is a valid Date', () => {
    const completedAt = new Date('2025-06-01T12:00:00Z');
    const tournament = makeTournament({ completedAt, status: 'active' });
    const result = mapTournamentDetail(tournament, makeContext(), [], sessionUserId);
    expect(result.completedAt).toBe(completedAt.toISOString());
    // Deadline must be after completedAt
    expect(new Date(result.organiserScoreEditDeadline!).getTime()).toBeGreaterThan(completedAt.getTime());
  });

  it('returns null organiserScoreEditDeadline when tournament is not completed', () => {
    const tournament = makeTournament({ completedAt: null, status: 'active' });
    const result = mapTournamentDetail(tournament, makeContext(), [], sessionUserId);
    expect(result.organiserScoreEditDeadline).toBeNull();
  });

  // ── numeric fields defensive clamping ──────────────────────────────────────

  it('clamps totalRounds to 1 when value is invalid', () => {
    const tournament = makeTournament({ totalRounds: 0 });
    const result = mapTournamentDetail(tournament, makeContext(), [], sessionUserId);
    expect(result.totalRounds).toBe(1);
  });

  it('clamps duration to 0 when value is not a finite number', () => {
    const tournament = makeTournament({ duration: NaN });
    const result = mapTournamentDetail(tournament, makeContext(), [], sessionUserId);
    expect(result.duration).toBe(0);
  });

  it('clamps entryFee to 0 when not finite', () => {
    const tournament = makeTournament({ entryFee: NaN });
    const result = mapTournamentDetail(tournament, makeContext(), [], sessionUserId);
    expect(result.entryFee).toBe(0);
  });

  // ── courts ────────────────────────────────────────────────────────────────

  it('maps courts from the club courts array', () => {
    const courtId = makeId();
    const tournament = makeTournament({
      club: {
        _id: makeId(),
        name: 'Club',
        address: null,
        logoUrl: null,
        courts: [{ _id: courtId, name: 'Court 1' }],
      } as unknown as TournamentPopulated['club'],
    });
    const result = mapTournamentDetail(tournament, makeContext(), [], sessionUserId);
    expect(result.courts).toHaveLength(1);
    expect(result.courts[0].id).toBe(courtId);
    expect(result.courts[0].name).toBe('Court 1');
  });

  it('returns empty courts when club has no courts', () => {
    const tournament = makeTournament({ club: null });
    const result = mapTournamentDetail(tournament, makeContext(), [], sessionUserId);
    expect(result.courts).toEqual([]);
  });
});
