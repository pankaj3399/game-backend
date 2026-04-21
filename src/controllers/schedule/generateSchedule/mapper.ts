export function mapGenerateScheduleResponse(
  scheduleId: { toString: () => string },
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
