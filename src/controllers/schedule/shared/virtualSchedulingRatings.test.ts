import { Types } from "mongoose";
import type { ScheduleParticipantInfo } from "./types";
import { computeRatingStep, computeVirtualSchedulingRatings } from "./virtualSchedulingRatings";

function participant(rating: number): ScheduleParticipantInfo {
  return {
    _id: new Types.ObjectId(),
    name: null,
    alias: null,
    profilePictureUrl: null,
    elo: { rating, rd: 200 },
  };
}

describe("computeVirtualSchedulingRatings", () => {
  it("keeps real ratings when list order matches rating rank", () => {
    const ordered = [participant(1800), participant(1700), participant(1600)];

    const virtual = computeVirtualSchedulingRatings(ordered);
    expect(virtual.get(ordered[0]._id.toString())).toBe(1800);
    expect(virtual.get(ordered[1]._id.toString())).toBe(1700);
    expect(virtual.get(ordered[2]._id.toString())).toBe(1600);
  });

  it("adjusts each virtual rating from that player's real rating and rank shift", () => {
    const ordered = [participant(1400), participant(1600), participant(1800)];
    const step = computeRatingStep(ordered);

    const virtual = computeVirtualSchedulingRatings(ordered);

    expect(virtual.get(ordered[0]._id.toString())).toBe(1400 + 2 * step);
    expect(virtual.get(ordered[1]._id.toString())).toBe(1600);
    expect(virtual.get(ordered[2]._id.toString())).toBe(1800 - 2 * step);
  });
});
