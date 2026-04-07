import type { TournamentPopulated } from "../../../types/api/tournament";
import { ROLES } from "../../../constants/roles";
import type { DetailViewContext } from "./authorize";
import { computeSpotsTotal } from "../computeSpotsTotal";

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
  playMode: string;
  tournamentMode: string;
  entryFee: number;
  minMember: number;
  maxMember: number;
  duration: string | null;
  breakDuration: string | null;
  courts: CourtInfo[];
  foodInfo: string;
  descriptionInfo: string;
  status: string;
  participants: ParticipantInfo[];
  progress: ProgressInfo;
  permissions: PermissionsInfo;
  createdAt: string | null;
  updatedAt: string | null;
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

/* =========================
   Main Mapper
========================= */

export function mapTournamentDetail(
  tournament: TournamentPopulated,
  context: DetailViewContext,
  clubSponsorsList: ClubSponsorDoc[],
  sessionUserId: string
): TournamentDetailResponse {
  if (!tournament) {
    throw new Error("Invalid tournament data: missing _id");
  }

  const tournamentId = toSafeStringId(tournament._id);
  if (!tournamentId) {
    throw new Error("Invalid tournament data: missing _id");
  }

  /* =========================
     Participants
  ========================= */

  const participantItems: ParticipantInfo[] = [];
  for (const p of tournament.participants ?? []) {
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

  const spotsFilled = participantItems.length;
  const spotsTotal = computeSpotsTotal(tournament.maxMember);

  const percentage = spotsTotal > 0 ? Math.round((spotsFilled / spotsTotal) * 100) : 0;

  /* =========================
     Permissions
  ========================= */

  const sessionParticipantId = sessionUserId.trim();
  const isParticipant = sessionParticipantId
    ? participantIdSet.has(sessionParticipantId)
    : false;

  const isAdminRole =
    context.role === ROLES.CLUB_ADMIN ||
    context.role === ROLES.SUPER_ADMIN;

  const isActive = tournament.status === "active";
  const hasAvailableSpots = spotsFilled < spotsTotal;

  const canJoin =
    isActive &&
    !isAdminRole &&
    !isParticipant &&
    hasAvailableSpots;

  /* =========================
     Courts
  ========================= */

  const courts: CourtInfo[] = [];
  for (const court of tournament.courts ?? []) {
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

  return {
    id: tournamentId,
    name: tournament.name,
    club,
    sponsor,
    clubSponsors,
    date: tournament.date instanceof Date ? tournament.date.toISOString() : null,
    startTime: tournament.startTime ?? null,
    endTime: tournament.endTime ?? null,
    playMode: tournament.playMode,
    tournamentMode: tournament.tournamentMode,
    entryFee: Number.isFinite(tournament.entryFee) ? tournament.entryFee : 0,
    minMember: Math.max(0, Math.trunc(Number(tournament.minMember)) || 0),
    maxMember: spotsTotal,
    duration: tournament.duration ?? null,
    breakDuration: tournament.breakDuration ?? null,
    courts,
    foodInfo: tournament.foodInfo ?? "",
    descriptionInfo: tournament.descriptionInfo ?? "",
    status: tournament.status,
    participants: participantItems,
    progress: {
      spotsFilled,
      spotsTotal,
      percentage,
    },
    permissions: {
      canEdit: context.isManager,
      canJoin,
      isParticipant,
    },
    createdAt: tournament.createdAt?.toISOString?.() || null,
    updatedAt: tournament.updatedAt?.toISOString?.() || null,
  };
}