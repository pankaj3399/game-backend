import type { Types } from "mongoose";
import type {
  GenerateScheduleBody,
  ScheduleParticipantInfo,
  TournamentScheduleContext,
} from "./types";

const DEFAULT_MATCH_DURATION_MINUTES = 60;
const DEFAULT_BREAK_TIME_MINUTES = 5;
const DEFAULT_GAMES_PER_PLAYER = 5;
const DEFAULT_START_TIME = "13:40";

function parseMinutesFromText(value: string | null, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const match = value.match(/(\d+)/);
  if (!match) {
    return fallback;
  }

  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getDefaultScheduleInput(tournament: TournamentScheduleContext) {
  const courts = tournament.club?.courts ?? [];
  const selectedDefault = new Set(courts.slice(0, Math.min(2, courts.length)).map((court) => court._id.toString()));

  return {
    matchDurationMinutes: parseMinutesFromText(
      tournament.duration,
      DEFAULT_MATCH_DURATION_MINUTES
    ),
    breakTimeMinutes: parseMinutesFromText(
      tournament.breakDuration,
      DEFAULT_BREAK_TIME_MINUTES
    ),
    gamesPerPlayer: DEFAULT_GAMES_PER_PLAYER,
    startTime: tournament.startTime ?? DEFAULT_START_TIME,
    mode: "singles" as const,
    availableCourts: courts.map((court) => ({
      id: court._id.toString(),
      name: court.name,
      selected: selectedDefault.has(court._id.toString()),
    })),
  };
}

export function participantDisplayName(
  participant: Pick<ScheduleParticipantInfo, "name" | "alias">,
  fallback: string
): string {
  if (participant.name && participant.name.trim().length > 0) {
    return participant.name;
  }

  if (participant.alias && participant.alias.trim().length > 0) {
    return participant.alias;
  }

  return fallback;
}

export function getParticipantOrder(
  participantOrder: string[],
  participants: ScheduleParticipantInfo[]
): ScheduleParticipantInfo[] {
  const byId = new Map(participants.map((participant) => [participant._id.toString(), participant]));
  const ordered: ScheduleParticipantInfo[] = [];
  const seen = new Set<string>();

  for (const id of participantOrder) {
    if (seen.has(id)) {
      continue;
    }
    const participant = byId.get(id);
    if (!participant) {
      continue;
    }

    ordered.push(participant);
    seen.add(id);
  }

  for (const participant of participants) {
    const id = participant._id.toString();
    if (seen.has(id)) {
      continue;
    }
    ordered.push(participant);
    seen.add(id);
  }

  return ordered;
}

export function buildDoublesPairs(
  participants: ScheduleParticipantInfo[]
): {
  teams: Array<{ team: number; players: [ScheduleParticipantInfo, ScheduleParticipantInfo] }>;
  unpaired: ScheduleParticipantInfo[];
} {
  const teams: Array<{ team: number; players: [ScheduleParticipantInfo, ScheduleParticipantInfo] }> = [];

  for (let index = 0; index + 1 < participants.length; index += 2) {
    teams.push({
      team: teams.length + 1,
      players: [participants[index], participants[index + 1]],
    });
  }

  const unpaired = participants.length % 2 === 1 ? [participants[participants.length - 1]] : [];
  return { teams, unpaired };
}

export function buildSinglesRoundPairs(
  participants: ScheduleParticipantInfo[]
): Array<{ playerOneId: Types.ObjectId; playerTwoId: Types.ObjectId }> {
  const pairs: Array<{ playerOneId: Types.ObjectId; playerTwoId: Types.ObjectId }> = [];

  for (let index = 0; index + 1 < participants.length; index += 2) {
    pairs.push({
      playerOneId: participants[index]._id,
      playerTwoId: participants[index + 1]._id,
    });
  }

  return pairs;
}

export function computeMatchStartTime(
  baseDate: Date | null,
  startTime: string,
  slotIndex: number,
  selectedCourtsCount: number,
  body: Pick<GenerateScheduleBody, "matchDurationMinutes" | "breakTimeMinutes">
): Date {
  const now = new Date();
  const dateRef = baseDate ? new Date(baseDate) : new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const [hourText, minuteText] = startTime.split(":");
  const hour = Number.parseInt(hourText, 10);
  const minute = Number.parseInt(minuteText, 10);

  dateRef.setHours(hour, minute, 0, 0);

  const timeBlock = body.matchDurationMinutes + body.breakTimeMinutes;
  const wave = Math.floor(slotIndex / Math.max(1, selectedCourtsCount));
  dateRef.setMinutes(dateRef.getMinutes() + wave * timeBlock);

  return dateRef;
}
