import type { Types } from "mongoose";
import type { DbIdLike } from "../../../types/domain/common";
import type { TournamentMode } from "../../../types/domain/tournament";
import type { TournamentPlayMode } from "../../../types/domain/tournament";

export type ScheduleMode = "singles" | "doubles";

export interface ScheduleCourtInfo {
  _id: Types.ObjectId;
  name: string;
}

export interface ScheduleCourtInfoRaw {
  _id?: DbIdLike | null;
  name?: string | null;
}

export interface ScheduleClubInfo {
  _id: Types.ObjectId;
  courts: ScheduleCourtInfo[];
}

export interface ScheduleClubInfoRaw {
  _id?: DbIdLike | null;
  courts?: ScheduleCourtInfoRaw[] | null;
}

export interface ScheduleParticipantElo {
  rating: number | null;
}

export interface ScheduleParticipantInfo {
  _id: Types.ObjectId;
  name: string | null;
  alias: string | null;
  elo: ScheduleParticipantElo;
}

export interface ScheduleParticipantInfoRaw {
  _id?: DbIdLike | null;
  name?: string | null;
  alias?: string | null;
  elo?: { rating?: number | null } | null;
}

export interface TournamentScheduleContext {
  _id: Types.ObjectId;
  name: string;
  minMember: number;
  firstRoundScheduledAt: Date | null;
  tournamentMode: TournamentMode;
  date: Date | null;
  startTime: string | null;
  duration: string | null;
  breakDuration: string | null;
  matchesPerPlayer: number;
  totalRounds: number;
  playMode: TournamentPlayMode;
  createdBy: Types.ObjectId;
  club: ScheduleClubInfo | null;
  participants: ScheduleParticipantInfo[];
  schedule: Types.ObjectId | null;
}

export interface TournamentScheduleContextRaw {
  _id?: DbIdLike | null;
  name?: string | null;
  minMember?: number | null;
  firstRoundScheduledAt?: Date | null;
  tournamentMode?: TournamentMode | null;
  date?: Date | null;
  startTime?: string | null;
  duration?: string | null;
  breakDuration?: string | null;
  matchesPerPlayer?: number | null;
  totalRounds?: number | null;
  playMode?: TournamentPlayMode | null;
  createdBy?: DbIdLike | null;
  club?: ScheduleClubInfoRaw | null;
  participants?: ScheduleParticipantInfoRaw[] | null;
  schedule?: DbIdLike | null;
}

export interface ScheduleInputResponse {
  matchDurationMinutes?: number;
  breakTimeMinutes?: number;
  matchesPerPlayer: number;
  startTime: string;
  mode: ScheduleMode;
  availableCourts: Array<{
    id: string;
    name: string;
    selected: boolean;
  }>;
}

export interface ScheduleParticipantResponse {
  id: string;
  name: string;
  alias: string | null;
  skillLabel: string;
  rating: number;
  order: number;
}

export interface TournamentScheduleResponse {
  tournament: {
    id: string;
    name: string;
  };
  scheduleInput: ScheduleInputResponse;
  participants: ScheduleParticipantResponse[];
  scheduleSummary: {
    currentRound: number;
    totalRounds: number;
  };
}

export interface GenerateScheduleBody {
  round: number;
  mode: ScheduleMode;
  matchDurationMinutes?: number;
  breakTimeMinutes?: number;
  matchesPerPlayer: number;
  startTime: string;
  courtIds: string[];
  participantOrder: string[];
}

export interface GeneratePairsBody {
  participantOrder: string[];
}
