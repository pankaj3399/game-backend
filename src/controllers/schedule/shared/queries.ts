import { Types } from "mongoose";
import Game from "../../../models/Game";
import Schedule from "../../../models/Schedule";
import Tournament from "../../../models/Tournament";
import type { ScheduleGameTiming } from "./resolveDefaultScheduleStartTime";
import type { DbIdLike } from "../../../types/domain/common";
import { parseTournamentScheduleContext, parseTournamentScheduleDocument } from "./scheduleContext.schema";
import type { TournamentScheduleContext, TournamentScheduleContextRaw } from "./types";

function toObjectId(value: DbIdLike | null | undefined): Types.ObjectId | null {
  if (!value) {
    return null;
  }

  if (value instanceof Types.ObjectId) {
    return value;
  }

  if (typeof value === "string" && Types.ObjectId.isValid(value)) {
    return new Types.ObjectId(value);
  }

  return null;
}

function buildNormalizedScheduleContext(raw: TournamentScheduleContextRaw) {
  const tournamentId = toObjectId(raw._id);
  if (!tournamentId) {
    throw new Error("Invalid tournament schedule context: missing _id");
  }

  const createdBy = toObjectId(raw.createdBy);
  if (!createdBy) {
    throw new Error("Invalid tournament schedule context: missing createdBy");
  }

  const rawSchedule = raw.schedule;
  const scheduleFieldForId =
    rawSchedule != null && typeof rawSchedule === "object" && "_id" in rawSchedule
      ? (rawSchedule as { _id: DbIdLike })._id
      : (rawSchedule as DbIdLike | null | undefined);
  const scheduleId = toObjectId(scheduleFieldForId);

  const courts: Array<{ _id: Types.ObjectId; name: string }> = [];
  const rawCourts = raw.club?.courts ?? [];
  for (const court of rawCourts) {
    const courtId = toObjectId(court._id);
    if (!courtId) {
      continue;
    }
    courts.push({
      _id: courtId,
      name: court.name?.trim() || "Court",
    });
  }

  const clubId = toObjectId(raw.club?._id);
  const club = clubId
    ? {
        _id: clubId,
        courts,
      }
    : null;

  const participants: Array<{
    _id: Types.ObjectId;
    name: string | null;
    alias: string | null;
    profilePictureUrl: string | null;
    elo: { rating: number | null; rd: number | null };
  }> = [];
  for (const participant of raw.participants ?? []) {
    const participantId = toObjectId(participant._id);
    if (!participantId) {
      continue;
    }

    participants.push({
      _id: participantId,
      name: participant.name ?? null,
      alias: participant.alias ?? null,
      profilePictureUrl: participant.profilePictureUrl ?? null,
      elo: {
        rating: participant.elo?.rating ?? null,
        rd: participant.elo?.rd ?? null,
      },
    });
  }

  const normalizedContext: TournamentScheduleContext = {
    _id: tournamentId,
    name: raw.name?.trim() || "Tournament",
    minMember:
      typeof raw.minMember === "number" && Number.isFinite(raw.minMember)
        ? Math.max(1, Math.trunc(raw.minMember))
        : 1,
    firstRoundScheduledAt: raw.firstRoundScheduledAt ?? null,
    tournamentMode: raw.tournamentMode ?? "singleDay",
    date: raw.date ?? null,
    startTime: raw.startTime ?? null,
    endTime: raw.endTime ?? null,
    timezone: raw.timezone ?? null,
    duration: raw.duration ?? null,
    breakDuration: raw.breakDuration ?? null,
    totalRounds:
      typeof raw.totalRounds === "number" && Number.isFinite(raw.totalRounds)
        ? Math.max(1, Math.min(100, Math.trunc(raw.totalRounds)))
        : 1,
    playMode: raw.playMode ?? "TieBreak10",
    createdBy,
    club,
    participants,
    schedule: scheduleId,
  };

  return normalizedContext;
}

export async function fetchTournamentScheduleContext(
  tournamentId: string
) {
  const raw = await Tournament.findById(tournamentId)
    .select(
      "_id name minMember firstRoundScheduledAt tournamentMode date startTime endTime timezone duration breakDuration totalRounds playMode createdBy club participants schedule"
    )
    .populate({
      path: "club",
      select: "_id",
      populate: {
        path: "courts",
        select: "_id name",
      },
    })
    .populate("participants", "name alias profilePictureUrl elo.rating elo.rd")
    .lean<TournamentScheduleContextRaw>()
    .exec();

  if (!raw) {
    return null;
  }

  return parseTournamentScheduleContext(buildNormalizedScheduleContext(raw));
}

export async function fetchScheduleForTournament(scheduleId: DbIdLike | null) {
  if (scheduleId == null) {
    return null;
  }

  const doc = await Schedule.findById(scheduleId)
    .select("_id status currentRound matchesPerPlayer matchDurationMinutes breakTimeMinutes rounds")
    .lean<Record<string, unknown>>()
    .exec();

  if (!doc) {
    return null;
  }

  return parseTournamentScheduleDocument(doc);
}

type ScheduleRoundEntry = {
  game: Types.ObjectId;
  round: number;
};

export async function fetchScheduleGameTimings(
  scheduleId: Types.ObjectId,
  rounds: ScheduleRoundEntry[]
): Promise<ScheduleGameTiming[]> {
  const gameIds = rounds.map((entry) => entry.game);
  if (gameIds.length === 0) {
    return [];
  }

  const roundByGameId = new Map(
    rounds.map((entry) => [entry.game.toString(), Math.trunc(entry.round)])
  );

  const games = await Game.find({
    schedule: scheduleId,
    _id: { $in: gameIds },
    isHistorical: { $ne: true },
  })
    .select("_id startTime endTime detachedFromRound")
    .lean<Array<{ _id: Types.ObjectId; startTime?: Date | null; endTime?: Date | null; detachedFromRound?: number | null }>>()
    .exec();

  return games.map((game) => ({
    round: roundByGameId.get(game._id.toString()) ?? 1,
    startTime: game.startTime ?? null,
    endTime: game.endTime ?? null,
    detachedFromRound: game.detachedFromRound ?? null,
  }));
}
