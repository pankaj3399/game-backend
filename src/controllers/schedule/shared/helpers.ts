import type { ScheduleParticipantInfo, TournamentScheduleContext } from "./types";
import {
  DEFAULT_BREAK_TIME_MINUTES,
  DEFAULT_MATCH_DURATION_MINUTES,
  DEFAULT_MATCHES_PER_PLAYER,
  DEFAULT_SCHEDULE_START_TIME,
} from "./constants";

export function getDefaultScheduleInput(
  tournament: TournamentScheduleContext,
  options?: { matchesPerPlayer?: number | null }
) {
  const courts = tournament.club?.courts ?? [];
  const selectedDefault = new Set(courts.slice(0, Math.min(2, courts.length)).map((court) => court._id.toString()));

  const resolvedMatchesPerPlayer =
    options?.matchesPerPlayer ?? DEFAULT_MATCHES_PER_PLAYER;

  const base = {
    matchesPerPlayer: resolvedMatchesPerPlayer,
    startTime: tournament.startTime ?? DEFAULT_SCHEDULE_START_TIME,
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
    matchDurationMinutes: tournament.duration ?? DEFAULT_MATCH_DURATION_MINUTES,
    breakTimeMinutes: tournament.breakDuration ?? DEFAULT_BREAK_TIME_MINUTES,
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

export function sortParticipantsForScheduling(participants: ScheduleParticipantInfo[]) {
  return [...participants].sort((left, right) => {
    const leftRating = left.elo.rating ?? 1500;
    const rightRating = right.elo.rating ?? 1500;
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
  let oddParticipant: ScheduleParticipantInfo | null = null;

  for (let index = 0; index + 1 < participants.length; index += 2) {
    teams.push({
      team: teams.length + 1,
      players: [participants[index], participants[index + 1]],
    });
  }

  if (participants.length % 2 === 1) {
    oddParticipant = participants[participants.length - 1];
  }

  return { teams, unpaired: oddParticipant ? [oddParticipant] : [] };
}

export function computeMatchStartTime(
  baseDate: Date | null,
  startTime: string,
  slotNumber: number,
  body: { matchDurationMinutes: number; breakTimeMinutes: number },
  options?: { windowEndTime?: string | null }
): Date {
  const now = new Date();
  const dateRef = baseDate
    ? new Date(Date.UTC(baseDate.getUTCFullYear(), baseDate.getUTCMonth(), baseDate.getUTCDate(), 0, 0, 0, 0))
    : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));

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

  const toMinutes = (value: string | null | undefined): number | null => {
    if (!value || !/^\d{1,2}:\d{1,2}$/.test(value)) {
      return null;
    }
    const [hText, mText] = value.split(":");
    const h = Number.parseInt(hText, 10);
    const m = Number.parseInt(mText, 10);
    if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || h > 23 || m < 0 || m > 59) {
      return null;
    }
    return h * 60 + m;
  };

  const startMinutes = hour * 60 + minute;

  const timeBlock = Math.max(1, body.matchDurationMinutes + body.breakTimeMinutes);
  const normalizedSlot =
    Number.isFinite(slotNumber) && slotNumber >= 1 ? Math.trunc(slotNumber) : 1;
  const wave = Math.max(0, normalizedSlot - 1);

  let waveInDay = wave;
  let dayOffset = 0;

  const hasWindowEndTime = options?.windowEndTime != null;
  const endMinutes = toMinutes(options?.windowEndTime ?? null);
  if (hasWindowEndTime && (endMinutes == null || endMinutes <= startMinutes)) {
    throw new Error(
      "Invalid schedule window endTime: must be a valid HH:MM later than startTime"
    );
  }
  const canUseWindow = endMinutes != null && endMinutes > startMinutes;

  if (canUseWindow) {
    const windowMinutes = endMinutes - startMinutes;
    const hasRoomForOneMatch = windowMinutes >= body.matchDurationMinutes;

    if (!hasRoomForOneMatch) {
      throw new Error(
        "Configured schedule window is shorter than a single match duration"
      );
    }

    const wavesPerDay =
      Math.floor((windowMinutes - body.matchDurationMinutes) / timeBlock) + 1;
    const normalizedWavesPerDay = Math.max(1, wavesPerDay);
    dayOffset = Math.floor(wave / normalizedWavesPerDay);
    waveInDay = wave % normalizedWavesPerDay;
  }

  dateRef.setUTCDate(dateRef.getUTCDate() + dayOffset);
  dateRef.setUTCHours(hour, minute, 0, 0);
  dateRef.setUTCMinutes(dateRef.getUTCMinutes() + waveInDay * timeBlock);

  return dateRef;
}
