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

	const newPlan = payload.plan;
	const newExpiresAt = payload.expiresAt;

	let finalPlan: 'free' | 'premium';
	let finalExpiresAt: Date | null;

	if (newPlan === 'free') {
		finalPlan = 'free';
		finalExpiresAt = null;
	} else if (newPlan === 'premium') {
		finalPlan = 'premium';
		finalExpiresAt = newExpiresAt!;
	} else {
		if (newExpiresAt !== undefined) {
			if (newExpiresAt === null) {
				finalPlan = 'free';
				finalExpiresAt = null;
			} else {
				finalPlan = 'premium';
				finalExpiresAt = newExpiresAt;
			}
		} else if (club.expiresAt != null && club.expiresAt.getTime() > Date.now()) {
			finalPlan = 'premium';
			finalExpiresAt = club.expiresAt;
		} else {
			finalPlan = 'free';
			finalExpiresAt = null;
		}
	}

	club.plan = finalPlan;
	club.expiresAt = finalExpiresAt;
	club.trialPremiumUntil = null;
	club.renewalRequestedAt = null;
	try{
		await club.save();
	} catch (err) {
		const mongoErr = err as { name?: string };
		if (mongoErr.name === 'VersionError') {
			return error(409, 'Club was modified concurrently. Please retry.');
		}
	}

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
