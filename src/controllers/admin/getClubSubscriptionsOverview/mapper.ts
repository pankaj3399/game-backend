import type mongoose from 'mongoose';
import type { ClubPlan } from '../../../models/Club';
import { hasEffectivePremiumAccess } from '../../../lib/subscription';

type ClubSubscriptionStatus = 'renewal_needed' | 'subscribed' | 'requested' | 'nothing';

interface ClubOverviewItemInput {
	_id: mongoose.Types.ObjectId;
	name: string;
	plan: ClubPlan;
	expiresAt: Date | null;
	trialPremiumUntil: Date | null;
	renewalRequestedAt: Date | null;
}

function mapSubscriptionStatus(
	plan: ClubPlan,
	expiresAt: Date | null,
	trialPremiumUntil: Date | null,
	renewalRequestedAt: Date | null,
	nowMs: number = Date.now()
): ClubSubscriptionStatus {
	if (renewalRequestedAt != null) {
		return 'requested';
	}

	if (hasEffectivePremiumAccess(plan, expiresAt, trialPremiumUntil, nowMs)) {
		return 'subscribed';
	}

	if (plan === 'free') {
		return 'nothing';
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
			trialPremiumUntil: club.trialPremiumUntil,
			hasPremiumAccess: hasEffectivePremiumAccess(
				club.plan,
				club.expiresAt,
				club.trialPremiumUntil,
				nowMs
			),
			renewalRequestedAt: club.renewalRequestedAt,
			status: mapSubscriptionStatus(
				club.plan,
				club.expiresAt,
				club.trialPremiumUntil,
				club.renewalRequestedAt,
				nowMs
			)
		}
	};
}