import type { Types } from "mongoose";

export function mapGenerateScheduleResponse(
  scheduleId: Types.ObjectId,
  targetRound: number,
  currentRound: number,
  generatedMatches: number
) {
  return {
    message: "Schedule generated",
    schedule: {
      id: scheduleId.toString(),
      round: targetRound,
      currentRound,
      generatedMatches,
    },
  };
}
