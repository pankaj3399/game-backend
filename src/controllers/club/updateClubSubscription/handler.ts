import type { Request } from 'express';
import { userCanManageClub } from '../../../lib/permissions';
import { buildPermissionContext } from '../../../shared/authContext';
import { error, ok } from '../../../shared/helpers';
import { findClubSubscriptionByIdForRenewal } from './queries';

type Session = NonNullable<Request['user']>;

/** Number of trial days granted immediately upon a premium upgrade/renewal request. */
const TRIAL_DAYS = 14;

export async function requestClubSubscriptionRenewalFlow(clubId: string, session: Session) {
	const ctx = buildPermissionContext(session);
	if (!(await userCanManageClub(ctx, clubId))) {
		return error(403, 'You do not have permission to manage this club');
	}

	const club = await findClubSubscriptionByIdForRenewal(clubId);
	if (!club) {
		return error(404, 'Club not found');
	}

	const now = new Date();

	// Record when the renewal was first requested (idempotent – don't overwrite).
	if (club.renewalRequestedAt == null) {
		club.renewalRequestedAt = now;
	}

	// Grant an immediate 2-week premium trial so the club can use premium
	// features while we prepare and they pay the invoice.
	// If they are already on premium with a future expiry that is longer than
	// the trial window, we leave the existing expiry untouched.
	const trialEnd = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
	if (club.plan !== 'premium' || club.expiresAt == null || club.expiresAt < trialEnd) {
		club.plan = 'premium';
		club.expiresAt = trialEnd;
	}

	try {
		await club.save();
	} catch (err) {
		if (err instanceof Error && err.name === 'VersionError') {
			return error(409, 'Club was modified concurrently. Please retry.');
		}
		throw err;
	}

	return ok(
		{
			club: {
				id: club._id.toString(),
				plan: club.plan,
				expiresAt: club.expiresAt,
				renewalRequestedAt: club.renewalRequestedAt
			}
		},
		{ status: 200, message: 'Club subscription renewal requested successfully' }
	);
}