import type { Request } from 'express';
import { userCanManageClub } from '../../../lib/permissions';
import { buildPermissionContext } from '../../../shared/authContext';
import { error, ok } from '../../../shared/helpers';
import { findClubSubscriptionByIdForRenewal } from './queries';

type Session = NonNullable<Request['user']>;

const ONE_WEEK_IN_MS = 7 * 24 * 60 * 60 * 1000;

export async function requestClubSubscriptionRenewalFlow(clubId: string, session: Session) {
	const ctx = buildPermissionContext(session);
	if (!(await userCanManageClub(ctx, clubId))) {
		return error(403, 'You do not have permission to manage this club');
	}

	const club = await findClubSubscriptionByIdForRenewal(clubId);
	if (!club) {
		return error(404, 'Club not found');
	}

	const now = Date.now();
	const oneWeekFromNow = new Date(now + ONE_WEEK_IN_MS);

	if (!club.trialPremiumUntil || club.trialPremiumUntil.getTime() < oneWeekFromNow.getTime()) {
		club.trialPremiumUntil = oneWeekFromNow;
	}

	if (club.renewalRequestedAt == null) {
		club.renewalRequestedAt = new Date();
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
				trialPremiumUntil: club.trialPremiumUntil,
				renewalRequestedAt: club.renewalRequestedAt
			}
		},
		{ status: 200, message: 'Club upgrade requested successfully. Temporary premium activated for one week' }
	);
}