import { z } from "zod";
import { ITournament } from "../../../models/Tournament";
import type { QueryFilter } from "mongoose";
import { isValidIanaTimeZone } from "../../../shared/timezone";
export const getTournamentQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(50).optional().default(10),
  q: z.string().optional(),
  view: z.enum(["published", "drafts"]).optional(),
  when: z.enum(["future", "past"]).optional(),
  distance: z.enum(["under50", "between50And80", "over80"]).optional(),
  club: z.string().regex(/^[0-9a-fA-F]{24}$/).optional(),
  timezone: z
    .string()
    .trim()
    .min(1)
    .refine(isValidIanaTimeZone, "Invalid timezone (expected IANA timezone like Asia/Kolkata)")
    .optional(),
});

export type GetTournamentQuery = z.infer<typeof getTournamentQuerySchema>;


export enum TournamentStatus {
  Active = "active",
  Draft = "draft",
}

type TournamentFilter = QueryFilter<ITournament>;

type ResolvedTournamentQuery = GetTournamentQuery & {
  distanceClubIds?: string[];
};

export type { TournamentFilter, ResolvedTournamentQuery };