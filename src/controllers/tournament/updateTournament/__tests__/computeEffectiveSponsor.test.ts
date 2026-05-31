import { computeEffectiveSponsor } from '../computeEffectiveSponsor';
import { Types } from 'mongoose';

describe('computeEffectiveSponsor()', () => {
  // ── Club changed + incoming sponsor omitted → always clear ──────────────

  it('returns null when club changed and incoming sponsor is undefined (forced clear)', () => {
    expect(computeEffectiveSponsor(true, undefined, 'existing-sponsor')).toBeNull();
  });

  it('returns null when club changed, incoming undefined, and current is null', () => {
    expect(computeEffectiveSponsor(true, undefined, null)).toBeNull();
  });

  it('returns null when club changed, incoming undefined, current is an ObjectId', () => {
    const oid = new Types.ObjectId();
    expect(computeEffectiveSponsor(true, undefined, oid)).toBeNull();
  });

  // ── Incoming sponsor explicitly provided → always wins ───────────────────

  it('uses the incoming sponsor string when explicitly set (even if club changed)', () => {
    expect(computeEffectiveSponsor(true, 'new-sponsor', 'old-sponsor')).toBe('new-sponsor');
  });

  it('uses the incoming sponsor string when club did NOT change', () => {
    expect(computeEffectiveSponsor(false, 'new-sponsor', null)).toBe('new-sponsor');
  });

  it('uses null incoming sponsor to explicitly clear the sponsor when provided as null', () => {
    // incomingSponsor = null means "client explicitly says: no sponsor"
    expect(computeEffectiveSponsor(false, null, 'old-sponsor')).toBeNull();
  });

  // ── Incoming omitted, club NOT changed → keep current ───────────────────

  it('returns current sponsor string when incoming is undefined and club did not change', () => {
    expect(computeEffectiveSponsor(false, undefined, 'existing-id')).toBe('existing-id');
  });

  it('converts an ObjectId current sponsor to string when incoming is omitted', () => {
    const oid = new Types.ObjectId();
    const result = computeEffectiveSponsor(false, undefined, oid);
    expect(result).toBe(oid.toString());
  });

  it('returns null when current sponsor is null and incoming is omitted', () => {
    expect(computeEffectiveSponsor(false, undefined, null)).toBeNull();
  });

  it('returns null when current sponsor is undefined and incoming is omitted', () => {
    expect(computeEffectiveSponsor(false, undefined, undefined)).toBeNull();
  });
});
