import type { TournamentPopulated } from "../../../types/api/tournament";
import type { DetailViewContext } from "./authorize";

export interface ClubInfo {
  id: string;
  name: string;
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
  logo: string | null;
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

export function mapTournamentDetail(
  tournament: TournamentPopulated,
  context: DetailViewContext,
  clubSponsorsList: ClubSponsorDoc[],
  sessionUserId: string
) {
  const participants = tournament.participants ?? []
  const participantItems = participants
    .map((p) => {
      const participantId = p._id?.toString();
      return {
        id: participantId,
        name: p.name,
        alias: p.alias,
      };
    })
    .filter((p) => Boolean(p.id));
  const participantIdSet = new Set(participantItems.map((p) => p.id));

  const spotsFilled = participantItems.length;
  const spotsTotal = Math.max(1, tournament.maxMember);
  const isParticipant = participantIdSet.has(sessionUserId);
  const canJoin =
    tournament.status === "active" &&
    !context.isManager &&
    !isParticipant &&
    spotsFilled < spotsTotal;

  const courts = (tournament.courts ?? [])
  .map((court) => ({
    id: court._id?.toString(),
    name: court.name,
    type: court.type,
    placement: court.placement,
  }));

  return {
    id: tournament._id.toString(),
    name: tournament.name,
    logo: tournament.logo ?? null,
    club: tournament.club
      ? {
          id: tournament.club._id.toString(),
          name: tournament.club.name,
        }
      : null,
    sponsor: tournament.sponsor
      ? {
          id: String(tournament.sponsor._id),
          name: tournament.sponsor.name,
          logoUrl: tournament.sponsor.logoUrl,
          link: tournament.sponsor.link,
        }
      : null,
    clubSponsors: clubSponsorsList.map((s) => ({
      id: s._id.toString(),
      name: s.name,
      logoUrl: s.logoUrl,
      link: s.link,
    })),
    date: tournament.date?.toISOString(),
    startTime: tournament.startTime,
    endTime: tournament.endTime,
    playMode: tournament.playMode,
    tournamentMode: tournament.tournamentMode,
    entryFee: tournament.entryFee,
    minMember: tournament.minMember,
    maxMember: tournament.maxMember,
    duration: tournament.duration,
    breakDuration: tournament.breakDuration,
    courts,
    foodInfo: tournament.foodInfo,
    descriptionInfo: tournament.descriptionInfo,
    status: tournament.status,
    participants: participantItems,
    progress: {
      spotsFilled,
      spotsTotal,
      percentage: Math.round((spotsFilled / spotsTotal) * 100),
    },
    permissions: {
      canEdit: context.isManager,
      canJoin,
      isParticipant,
    },
    createdAt: tournament.createdAt?.toISOString(),
    updatedAt: tournament.updatedAt?.toISOString(),
  };
}
