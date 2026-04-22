import type { TournamentPopulated } from "../../../types/api/tournament";
import { ROLES } from "../../../constants/roles";
import type { DetailViewContext } from "../shared/authorizeGetById";
import { computeSpotsTotal } from "../computeSpotsTotal";
import type { TournamentLeaveBlockers } from "../shared/fetchTournamentById";
import {
  DEFAULT_TOURNAMENT_TIMEZONE,
  getZonedDateParts,
  isValidIanaTimeZone,
} from "../../../shared/timezone";

/* =========================
   Response Types
========================= */

export interface ClubInfo {
  id: string;
  name: string;
  address: string | null;
}

export interface SponsorInfo {
  id: string;
  name: string;
  logoUrl: string | null;
  link: string | null;
}

export interface ClubSponsorInfo {
  id: string;
  name: string;
  logoUrl: string | null;
  link: string | null;
}

interface ClubSponsorDoc {
  _id: string | { toString(): string };
  name?: string | null;
  logoUrl?: string | null;
  link?: string | null;
}

export interface CourtInfo {
  id: string;
  name: string;
  type: string | null;
  placement: string | null;
}

export interface ParticipantInfo {
  id: string;
  name: string | null;
  alias: string | null;
}

export interface ProgressInfo {
  spotsFilled: number;
  spotsTotal: number;
  percentage: number;
}

export interface PermissionsInfo {
  canEdit: boolean;
  canJoin: boolean;
  canLeave: boolean;
  isParticipant: boolean;
}

export interface TournamentDetailResponse {
  id: string;
  name: string;
  club: ClubInfo | null;
  sponsor: SponsorInfo | null;
  clubSponsors: ClubSponsorInfo[];
  date: string | null;
  startTime: string | null;
  endTime: string | null;
  timezone: string | null;
  playMode: string;
  tournamentMode: string;
  entryFee: number;
  minMember: number;
  maxMember: number;
  totalRounds: number;
  duration: number;
  breakDuration: number;
  courts: CourtInfo[];
  foodInfo: string;
  descriptionInfo: string;
  status: string;
  participants: ParticipantInfo[];
  progress: ProgressInfo;
  permissions: PermissionsInfo;
  createdAt: string | null;
  updatedAt: string | null;
  completedAt?: string | null;
}

/* =========================
   Helpers
========================= */

function toSafeStringId(id: unknown): string | null {
  if (id === null || id === undefined) return null;

  try {
    const trimmed = String(id).trim();
    if (!trimmed || trimmed === "[object Object]") return null;

    return trimmed;
  } catch {
    return null;
  }
}

function formatDateOnlyUtc(value: Date, timezone?: string | null): string | null {
  if (!Number.isFinite(value.getTime())) {
    return null;
  }

  const safeTimezone = isValidIanaTimeZone(timezone)
    ? timezone
    : DEFAULT_TOURNAMENT_TIMEZONE;
  const parts = getZonedDateParts(value, safeTimezone);
  const year = parts.year;
  const month = String(parts.month).padStart(2, "0");
  const day = String(parts.day).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/* =========================
   Main Mapper
========================= */

export function mapTournamentDetail(
  tournament: TournamentPopulated,
  context: DetailViewContext,
  clubSponsorsList: ClubSponsorDoc[],
  sessionUserId: string,
  leaveBlockers?: TournamentLeaveBlockers
): TournamentDetailResponse {
  if (!tournament) {
    throw new Error("Invalid tournament data: missing tournament");
  }

  const tournamentId = toSafeStringId(tournament._id);
  if (!tournamentId) {
    throw new Error("Invalid tournament data: missing _id");
  }

  /* =========================
     Participants
  ========================= */

  const participantsRaw = tournament.participants ?? [];
  const participantItems: ParticipantInfo[] = [];
  for (const p of participantsRaw) {
    const id = toSafeStringId(p._id);
    if (!id) continue;

    participantItems.push({
      id,
      name: p.name ?? null,
      alias: p.alias ?? null,
    });
  }

  const participantIdSet = new Set(participantItems.map((p) => p.id));

  /* =========================
     Progress
  ========================= */

  const spotsFilled = participantsRaw.length;
  const rawSpotsTotal = computeSpotsTotal(tournament.maxMember);
  const maxMemberNum = Number(tournament.maxMember);
  const spotsTotalForResponse = Number.isFinite(rawSpotsTotal)
    ? rawSpotsTotal
    : Number.isFinite(maxMemberNum) && Math.trunc(maxMemberNum) >= 1
      ? Math.trunc(maxMemberNum)
      : 1;

  const percentage =
    rawSpotsTotal > 0 && Number.isFinite(rawSpotsTotal)
      ? Math.round((spotsFilled / rawSpotsTotal) * 100)
      : 0;

  /* =========================
     Permissions
  ========================= */

  const sessionParticipantId = sessionUserId.trim();
  const isParticipant = sessionParticipantId
    ? participantIdSet.has(sessionParticipantId)
    : false;

  const canEdit = context.isCreator || context.role === ROLES.SUPER_ADMIN;

  const isActive = tournament.status === "active";
  // Verification: tournaments without maxMember normalize to Infinity and remain joinable.
  const hasAvailableSpots =
    rawSpotsTotal === Infinity || spotsFilled < rawSpotsTotal;
  const canJoin =
    isActive &&
    !isParticipant &&
    hasAvailableSpots;
  const hasLeaveBlockers =
    isParticipant &&
    ((leaveBlockers?.hasPendingScoreMatches ?? false) ||
      (leaveBlockers?.hasUnfinishedMatches ?? false));
  const canLeave = isParticipant && !hasLeaveBlockers;

  /* =========================
     Courts
  ========================= */

  const courts: CourtInfo[] = [];
  for (const court of tournament.club?.courts ?? []) {
    const id = toSafeStringId(court._id);
    if (!id) continue;

    courts.push({
      id,
      name: court.name ?? "",
      type: court.type ?? null,
      placement: court.placement ?? null,
    });
  }

  /* =========================
     Club
  ========================= */

  const club: ClubInfo | null = tournament.club
    ? (() => {
        const id = toSafeStringId(tournament.club._id);
        if (!id) return null;

        return {
          id,
          name: tournament.club.name ?? "",
          address: tournament.club.address ?? null,
        };
      })()
    : null;

  /* =========================
     Sponsor
  ========================= */

  const sponsor: SponsorInfo | null = tournament.sponsor
    ? (() => {
        const id = toSafeStringId(tournament.sponsor?._id);
        if (!id) return null;

        return {
          id,
          name: tournament.sponsor.name ?? "",
          logoUrl: tournament.sponsor.logoUrl ?? null,
          link: tournament.sponsor.link ?? null,
        };
      })()
    : null;

  /* =========================
     Club Sponsors
  ========================= */

  const clubSponsors: ClubSponsorInfo[] = [];
  for (const s of clubSponsorsList) {
    const id = toSafeStringId(s._id);
    if (!id) continue;

    clubSponsors.push({
      id,
      name: s.name ?? "",
      logoUrl: s.logoUrl ?? null,
      link: s.link ?? null,
    });
  }

  /* =========================
     Final Response
  ========================= */

  const effectiveTimezone = tournament.timezone ?? DEFAULT_TOURNAMENT_TIMEZONE;

  return {
    id: tournamentId,
    name: tournament.name,
    club,
    sponsor,
    clubSponsors,
    date:
      tournament.date instanceof Date
        ? formatDateOnlyUtc(tournament.date, effectiveTimezone)
        : null,
    startTime: tournament.startTime ?? null,
    endTime: tournament.endTime ?? null,
    timezone: effectiveTimezone,
    playMode: tournament.playMode,
    tournamentMode: tournament.tournamentMode,
    entryFee: Number.isFinite(tournament.entryFee) ? tournament.entryFee : 0,
    minMember: Math.max(
      0,
      Number.isFinite(Number(tournament.minMember))
        ? Math.trunc(Number(tournament.minMember))
        : 0
    ),
    maxMember: spotsTotalForResponse,
    totalRounds:
      Number.isFinite(Number(tournament.totalRounds)) && Math.trunc(Number(tournament.totalRounds)) >= 1
        ? Math.trunc(Number(tournament.totalRounds))
        : 1,
    duration:
      typeof tournament.duration === "number" && Number.isFinite(tournament.duration)
        ? Math.trunc(tournament.duration)
        : 0,
    breakDuration:
      typeof tournament.breakDuration === "number" && Number.isFinite(tournament.breakDuration)
        ? Math.trunc(tournament.breakDuration)
        : 0,
    courts,
    foodInfo: tournament.foodInfo ?? "",
    descriptionInfo: tournament.descriptionInfo ?? "",
    status: tournament.status,
    participants: participantItems,
    progress: {
      spotsFilled,
      spotsTotal: spotsTotalForResponse,
      percentage,
    },
    permissions: {
      canEdit,
      canJoin,
      canLeave,
      isParticipant,
    },
    createdAt: tournament.createdAt instanceof Date ? tournament.createdAt.toISOString() : null,
    updatedAt: tournament.updatedAt instanceof Date ? tournament.updatedAt.toISOString() : null,
    completedAt: tournament.completedAt instanceof Date ? tournament.completedAt.toISOString() : null,
  };
}