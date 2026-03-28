import type { ClubPlan } from '../models/Club';

export function hasActiveTrialPremium(
	trialPremiumUntil: Date | null | undefined,
	nowMs: number = Date.now()
): boolean {
	if (!trialPremiumUntil) {
		return false;
	}

	return trialPremiumUntil.getTime() > nowMs;
}

export function hasEffectivePremiumAccess(
	plan: ClubPlan,
	expiresAt: Date | null | undefined,
	trialPremiumUntil: Date | null | undefined,
	nowMs: number = Date.now()
): boolean {
	if (hasActiveTrialPremium(trialPremiumUntil, nowMs)) {
		return true;
	}

	if (plan !== 'premium') {
		return false;
	}

	if (!expiresAt) {
		return false;
	}

	return expiresAt.getTime() > nowMs;
}
