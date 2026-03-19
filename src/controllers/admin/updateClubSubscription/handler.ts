import { error, ok } from '../../../shared/helpers';
import type { UpdateClubSubscriptionInput } from './validation';
import { findClubSubscriptionByIdForUpdate } from './queries';

export async function updateClubSubscriptionFlow(
  clubId: string,
  payload: UpdateClubSubscriptionInput
) {
  const club = await findClubSubscriptionByIdForUpdate(clubId);

  if (!club) {
    return error(404, 'Club not found');
  }

  /**
   * STEP 1: Apply explicit payload fields
   */
  if (payload.plan !== undefined) {
    club.plan = payload.plan;
  }

  if (payload.expiresAt !== undefined) {
    club.expiresAt = payload.expiresAt;
  }

  /**
   * STEP 2: Resolve invariants with correct precedence
   */

  // ✅ Explicit downgrade ALWAYS wins
  if (payload.plan === 'free') {
    club.plan = 'free';
    club.expiresAt = null;
  } else {
    // If expiresAt is explicitly provided (including null), respect it
    if (payload.expiresAt !== undefined) {
      if (payload.expiresAt === null) {
        club.plan = 'free';
        club.expiresAt = null;
      } else {
        club.plan = 'premium';
        club.expiresAt = payload.expiresAt;
      }
    } else {
      // No expiresAt in payload → derive from existing state
      if (club.expiresAt !== null) {
        club.plan = 'premium';
      } else {
        club.plan = 'free';
      }
    }
  }

  await club.save();

  return ok(
    {
      club: {
        id: club._id,
        plan: club.plan,
        expiresAt: club.expiresAt,
      },
    },
    { status: 200, message: 'Club subscription updated successfully' }
  );
}