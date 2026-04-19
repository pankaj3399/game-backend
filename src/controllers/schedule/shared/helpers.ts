import type { Types } from "mongoose";
import type {
  GenerateScheduleBody,
  ScheduleParticipantInfo,
  TournamentScheduleContext,
} from "./types";

const DEFAULT_MATCH_DURATION_MINUTES = 60;
const DEFAULT_BREAK_TIME_MINUTES = 5;
const DEFAULT_MATCHES_PER_PLAYER = 1;
const DEFAULT_START_TIME = "13:40";

function parseMinutesFromText(
  value: string | number | null | undefined,
  fallback: number,
  allowZero = false
): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    const t = Math.trunc(value);
    if (allowZero) {
      return t >= 0 ? t : fallback;
    }
    return t > 0 ? t : fallback;
  }

  if (typeof value !== "string" || !value) {
    return fallback;
  }

  const match = value.match(/(\d+)/);
  if (!match) {
    return fallback;
  }

  const parsed = Number.parseInt(match[1], 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  if (allowZero && parsed >= 0) {
    return parsed;
  }
  return parsed > 0 ? parsed : fallback;
}

export function getDefaultScheduleInput(tournament: TournamentScheduleContext) {
  const courts = tournament.club?.courts ?? [];
  const selectedDefault = new Set(courts.slice(0, Math.min(2, courts.length)).map((court) => court._id.toString()));

  const base = {
    matchesPerPlayer:
      Number.isFinite(tournament.matchesPerPlayer) && tournament.matchesPerPlayer >= 1
        ? Math.trunc(tournament.matchesPerPlayer)
        : DEFAULT_MATCHES_PER_PLAYER,
    startTime: tournament.startTime ?? DEFAULT_START_TIME,
    mode: "singles" as const,
    availableCourts: courts.map((court) => ({
      id: court._id.toString(),
      name: court.name,
      selected: selectedDefault.has(court._id.toString()),
    })),
  };

  if (tournament.tournamentMode !== "singleDay") {
    return base;
  }

  return {
    ...base,
    matchDurationMinutes: parseMinutesFromText(
      tournament.duration,
      DEFAULT_MATCH_DURATION_MINUTES
    ),
    breakTimeMinutes: parseMinutesFromText(
      tournament.breakDuration,
      DEFAULT_BREAK_TIME_MINUTES,
      true
    ),
  };
}

/** Prefer trimmed alias, then trimmed name (same precedence as getMyScore resolveName). */
export function participantDisplayName(
  participant: Pick<ScheduleParticipantInfo, "name" | "alias">,
  fallback: string
): string {
  const alias = participant.alias?.trim();
  if (alias) {
    return alias;
  }

  const name = participant.name?.trim();
  if (name) {
    return name;
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

  return ordered;
}

export function sortParticipantsForScheduling(participants: ScheduleParticipantInfo[]) {
  return [...participants].sort((left, right) => {
    const leftRating = typeof left.elo?.rating === "number" ? left.elo.rating : 1500;
    const rightRating = typeof right.elo?.rating === "number" ? right.elo.rating : 1500;
    if (leftRating !== rightRating) {
      return rightRating - leftRating;
    }

    const leftName = participantDisplayName(left, "").toLocaleLowerCase();
    const rightName = participantDisplayName(right, "").toLocaleLowerCase();
    if (leftName !== rightName) {
      return leftName.localeCompare(rightName);
    }

    return left._id.toString().localeCompare(right._id.toString());
  });
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

  // Odd participant counts intentionally leave the final participant unpaired for this round.
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
  slotNumber: number,
  body: { matchDurationMinutes: number; breakTimeMinutes: number }
): Date {
  const now = new Date();
  const dateRef = baseDate ? new Date(baseDate) : new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (!/^\d{1,2}:\d{1,2}$/.test(startTime)) {
    throw new Error(`Invalid startTime format: expected "HH:MM", got "${startTime}"`);
  }

  const [hourText, minuteText] = startTime.split(":");
  const hour = Number.parseInt(hourText, 10);
  const minute = Number.parseInt(minuteText, 10);
  const validHour = Number.isInteger(hour) && hour >= 0 && hour <= 23;
  const validMinute = Number.isInteger(minute) && minute >= 0 && minute <= 59;
  if (!validHour || !validMinute) {
    throw new Error(`Invalid startTime values: hour=${hourText}, minute=${minuteText}`);
  }

  dateRef.setHours(hour, minute, 0, 0);

  const timeBlock = body.matchDurationMinutes + body.breakTimeMinutes;
  const normalizedSlot =
    Number.isFinite(slotNumber) && slotNumber >= 1 ? Math.trunc(slotNumber) : 1;
  const wave = Math.max(0, normalizedSlot - 1);
  dateRef.setMinutes(dateRef.getMinutes() + wave * timeBlock);

  return dateRef;
}
