import { Types } from "mongoose";
import Schedule from "../../../models/Schedule";
import Tournament from "../../../models/Tournament";
import type { DbIdLike } from "../../../types/domain/common";
import type {
  ScheduleCourtInfo,
  ScheduleParticipantInfo,
  TournamentScheduleContext,
  TournamentScheduleContextRaw,
} from "./types";

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

function normalizeScheduleContext(raw: TournamentScheduleContextRaw): TournamentScheduleContext {
  const tournamentId = toObjectId(raw._id);
  if (!tournamentId) {
    throw new Error("Invalid tournament schedule context: missing _id");
  }

  const createdBy = toObjectId(raw.createdBy);
  if (!createdBy) {
    throw new Error("Invalid tournament schedule context: missing createdBy");
  }

  const scheduleId = toObjectId(raw.schedule);

  const courts: ScheduleCourtInfo[] = [];
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

  const participants: ScheduleParticipantInfo[] = [];
  for (const participant of raw.participants ?? []) {
    const participantId = toObjectId(participant._id);
    if (!participantId) {
      continue;
    }

    participants.push({
      _id: participantId,
      name: participant.name ?? null,
      alias: participant.alias ?? null,
      elo: {
        rating: participant.elo?.rating ?? null,
      },
    });
  }

  return {
    _id: tournamentId,
    name: raw.name?.trim() || "Tournament",
    date: raw.date ?? null,
    startTime: raw.startTime ?? null,
    duration: raw.duration ?? null,
    breakDuration: raw.breakDuration ?? null,
    playMode: raw.playMode ?? "TieBreak10",
    createdBy,
    club,
    participants,
    schedule: scheduleId,
  };
}

export async function fetchTournamentScheduleContext(
  tournamentId: string
): Promise<TournamentScheduleContext | null> {
  const raw = await Tournament.findById(tournamentId)
    .select(
      "_id name date startTime duration breakDuration playMode createdBy club participants schedule"
    )
    .populate({
      path: "club",
      select: "_id",
      populate: {
        path: "courts",
        select: "name",
      },
    })
    .populate("participants", "name alias elo.rating")
    .lean<TournamentScheduleContextRaw>()
    .exec();

  if (!raw) {
    return null;
  }

  return normalizeScheduleContext(raw);
}

export async function fetchScheduleForTournament(
  tournamentId: string,
  scheduleId: DbIdLike | null
) {
  const query = scheduleId
    ? Schedule.findById(scheduleId)
    : Schedule.findOne({ tournament: tournamentId });

  return query
    .select("_id status currentRound rounds")
    .lean<{
      _id: Types.ObjectId;
      status: "draft" | "active" | "finished";
      currentRound: number;
      rounds: Array<{ game: Types.ObjectId; slot: number; round: number }>;
    }>()
    .exec();
}
