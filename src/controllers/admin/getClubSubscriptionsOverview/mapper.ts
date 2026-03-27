import type mongoose from 'mongoose';
import type { ClubPlan } from '../../../models/Club';

type ClubSubscriptionStatus = 'renewal_needed' | 'subscribed' | 'requested' | 'nothing';

interface ClubOverviewItemInput {
	_id: mongoose.Types.ObjectId;
	name: string;
	plan: ClubPlan;
	expiresAt: Date | null;
	renewalRequestedAt: Date | null;
}

function mapSubscriptionStatus(
	plan: ClubPlan,
	expiresAt: Date | null,
	renewalRequestedAt: Date | null,
	nowMs: number = Date.now()
): ClubSubscriptionStatus {
	if (plan === 'free') {
		return 'nothing';
	}

	if (renewalRequestedAt != null) {
		return 'requested';
	}

	if (!expiresAt || expiresAt.getTime() <= nowMs) {
		return 'renewal_needed';
	}

	return 'subscribed';
}

export function mapClubSubscriptionOverviewItem(
	club: ClubOverviewItemInput,
	membersCount: number,
	nowMs: number = Date.now()
) {
	return {
		id: club._id.toString(),
		name: club.name,
		members: membersCount,
		subscription: {
			plan: club.plan,
			expiresAt: club.expiresAt,
			renewalRequestedAt: club.renewalRequestedAt,
			status: mapSubscriptionStatus(club.plan, club.expiresAt, club.renewalRequestedAt, nowMs)
		}
	};
}