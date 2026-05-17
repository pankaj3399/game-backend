import type mongoose from "mongoose";
import type { ClubPlan } from "../../../models/Club";

type ClubSubscriptionStatus =
  | "renewal_needed"
  | "subscribed"
  | "trial"
  | "requested"
  | "nothing";

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
  nowMs: number = Date.now(),
): ClubSubscriptionStatus {
  // A club is on "trial" when:
  //   - a renewal/upgrade request is pending (invoice not yet confirmed paid), AND
  //   - the club is currently on premium with a future expiry (i.e. trial access is active).
  if (renewalRequestedAt != null) {
    if (plan === "premium" && expiresAt != null && expiresAt.getTime() > nowMs) {
      return "trial";
    }
    // Renewal requested but no active premium yet (edge case / legacy).
    return "requested";
  }

  if (plan === "free") {
    return "nothing";
  }

  if (!expiresAt || expiresAt.getTime() <= nowMs) {
    return "renewal_needed";
  }

  return "subscribed";
}

export function mapClubSubscriptionOverviewItem(
  club: ClubOverviewItemInput,
  membersCount: number,
  nowMs: number = Date.now(),
) {
  return {
    id: club._id.toString(),
    name: club.name,
    members: membersCount,
    subscription: {
      plan: club.plan,
      expiresAt: club.expiresAt,
      renewalRequestedAt: club.renewalRequestedAt,
      status: mapSubscriptionStatus(
        club.plan,
        club.expiresAt,
        club.renewalRequestedAt,
        nowMs,
      ),
    },
  };
}
