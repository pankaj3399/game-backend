import { Types } from 'mongoose';
import {
  mapClubSubscriptionOverviewItem,
} from '../mapper';

const baseClub = {
  _id: new Types.ObjectId(),
  name: 'Test Club',
};

describe('mapClubSubscriptionOverviewItem() — subscription status', () => {
  const NOW = Date.now();
  const FUTURE = new Date(NOW + 30 * 24 * 60 * 60 * 1000); // +30 days
  const PAST = new Date(NOW - 1 * 24 * 60 * 60 * 1000);   // -1 day

  it('"trial": renewalRequestedAt set AND premium plan with future expiry', () => {
    const result = mapClubSubscriptionOverviewItem(
      { ...baseClub, plan: 'premium', expiresAt: FUTURE, renewalRequestedAt: new Date() },
      5,
      NOW
    );
    expect(result.subscription.status).toBe('trial');
  });

  it('"requested": renewalRequestedAt set but NOT on active premium', () => {
    const result = mapClubSubscriptionOverviewItem(
      { ...baseClub, plan: 'free', expiresAt: null, renewalRequestedAt: new Date() },
      3,
      NOW
    );
    expect(result.subscription.status).toBe('requested');
  });

  it('"requested": renewalRequestedAt set, premium plan but expiry in the past (no active trial)', () => {
    const result = mapClubSubscriptionOverviewItem(
      { ...baseClub, plan: 'premium', expiresAt: PAST, renewalRequestedAt: new Date() },
      2,
      NOW
    );
    expect(result.subscription.status).toBe('requested');
  });

  it('"nothing": free plan, no renewal request', () => {
    const result = mapClubSubscriptionOverviewItem(
      { ...baseClub, plan: 'free', expiresAt: null, renewalRequestedAt: null },
      10,
      NOW
    );
    expect(result.subscription.status).toBe('nothing');
  });

  it('"renewal_needed": premium plan with no expiresAt', () => {
    const result = mapClubSubscriptionOverviewItem(
      { ...baseClub, plan: 'premium', expiresAt: null, renewalRequestedAt: null },
      7,
      NOW
    );
    expect(result.subscription.status).toBe('renewal_needed');
  });

  it('"renewal_needed": premium plan with past expiry', () => {
    const result = mapClubSubscriptionOverviewItem(
      { ...baseClub, plan: 'premium', expiresAt: PAST, renewalRequestedAt: null },
      7,
      NOW
    );
    expect(result.subscription.status).toBe('renewal_needed');
  });

  it('"subscribed": premium plan with future expiry', () => {
    const result = mapClubSubscriptionOverviewItem(
      { ...baseClub, plan: 'premium', expiresAt: FUTURE, renewalRequestedAt: null },
      12,
      NOW
    );
    expect(result.subscription.status).toBe('subscribed');
  });

  it('maps club id, name, and members correctly', () => {
    const result = mapClubSubscriptionOverviewItem(
      { ...baseClub, plan: 'free', expiresAt: null, renewalRequestedAt: null },
      42,
      NOW
    );
    expect(result.id).toBe(baseClub._id.toString());
    expect(result.name).toBe('Test Club');
    expect(result.members).toBe(42);
  });

  it('passes through plan, expiresAt, and renewalRequestedAt in subscription field', () => {
    const result = mapClubSubscriptionOverviewItem(
      { ...baseClub, plan: 'premium', expiresAt: FUTURE, renewalRequestedAt: null },
      1,
      NOW
    );
    expect(result.subscription.plan).toBe('premium');
    expect(result.subscription.expiresAt).toStrictEqual(FUTURE);
    expect(result.subscription.renewalRequestedAt).toBeNull();
  });
});
