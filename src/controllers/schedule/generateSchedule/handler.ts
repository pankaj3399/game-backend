import Game from "../../../models/Game";
import Schedule from "../../../models/Schedule";
import Tournament from "../../../models/Tournament";
import {
  buildSinglesRoundPairs,
  computeMatchStartTime,
  getParticipantOrder,
} from "../shared/helpers";
import type {
  GenerateScheduleBody,
  TournamentScheduleContext,
} from "../shared/types";

export async function persistSinglesScheduleRound(
  tournament: TournamentScheduleContext,
  body: GenerateScheduleBody
): Promise<{ scheduleId: import("mongoose").Types.ObjectId; currentRound: number; generatedMatches: number }> {
  const availableCourtIds = new Set(
    (tournament.club?.courts ?? []).map((court) => court._id.toString())
  );
  const selectedCourtIds = body.courtIds.filter((courtId) => availableCourtIds.has(courtId));
  if (selectedCourtIds.length === 0) {
    throw new Error("At least one valid court must be selected");
  }

  const orderedParticipants = getParticipantOrder(body.participantOrder, tournament.participants);
  const singlesPairs = buildSinglesRoundPairs(orderedParticipants);
  if (singlesPairs.length === 0) {
    throw new Error("At least two participants are required to generate schedule");
  }

  let scheduleDoc = tournament.schedule ? await Schedule.findById(tournament.schedule).exec() : null;

  if (!scheduleDoc) {
    scheduleDoc = await Schedule.findOneAndUpdate(
      { tournament: tournament._id },
      {
        $setOnInsert: {
          tournament: tournament._id,
          currentRound: 0,
          rounds: [],
          status: "draft",
        },
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      }
    ).exec();
  }

  if (!scheduleDoc) {
    throw new Error("Unable to initialize tournament schedule");
  }

  const targetRound = body.round;
  const existingRoundEntries = scheduleDoc.rounds.filter((entry) => entry.round === targetRound);

  if (existingRoundEntries.length > 0) {
    await Game.deleteMany({
      _id: { $in: existingRoundEntries.map((entry) => entry.game) },
      schedule: scheduleDoc._id,
    }).exec();

    scheduleDoc.rounds = scheduleDoc.rounds.filter((entry) => entry.round !== targetRound);
  }

  const gameDocs = singlesPairs.map((pair, index) => ({
    playerOne: pair.playerOneId,
    playerTwo: pair.playerTwoId,
    court: selectedCourtIds[index % selectedCourtIds.length],
    tournament: tournament._id,
    schedule: scheduleDoc._id,
    score: {
      playerOneScores: [],
      playerTwoScores: [],
    },
    startTime: computeMatchStartTime(
      tournament.date,
      body.startTime,
      index,
      selectedCourtIds.length,
      body
    ),
    status: "draft" as const,
    gameMode: "tournament" as const,
    playMode: tournament.playMode,
  }));

  const createdGames = await Game.insertMany(gameDocs, { ordered: true });

  const newRoundEntries = createdGames.map((game, index) => ({
    game: game._id,
    slot: index + 1,
    round: targetRound,
  }));

  scheduleDoc.rounds.push(...newRoundEntries);
  scheduleDoc.rounds.sort((a, b) => {
    if (a.round !== b.round) {
      return a.round - b.round;
    }
    return a.slot - b.slot;
  });

  scheduleDoc.currentRound = Math.max(scheduleDoc.currentRound, targetRound);
  scheduleDoc.status = "active";
  await scheduleDoc.save();

  await Tournament.updateOne(
    { _id: tournament._id },
    {
      $set: {
        schedule: scheduleDoc._id,
        duration: `${body.matchDurationMinutes} min`,
        breakDuration: `${body.breakTimeMinutes} min`,
        startTime: body.startTime,
      },
    }
  ).exec();

  return {
    scheduleId: scheduleDoc._id,
    currentRound: scheduleDoc.currentRound,
    generatedMatches: createdGames.length,
  };
}
