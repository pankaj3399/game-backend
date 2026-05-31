import type { TournamentListDoc } from "../../../types/api/tournament";
import {
  DEFAULT_TOURNAMENT_TIMEZONE,
  getZonedDateParts,
} from "../../../shared/timezone";

export interface TournamentListItem {
  id: string;
  name: string;
  logoUrl: string | null;
  club: { id: string; name: string; logoUrl: string | null } | null;
  date: string | null;
  status: string;
  sponsor: {
    id: string;
    name: string;
    logoUrl?: string | null;
    link?: string | null;
  } | null;
}

function formatDateOnlyUtc(
  value: Date | string,
  timezone?: string | null
): string | null {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return null;
  }

  const parts = getZonedDateParts(
    date,
    timezone ?? DEFAULT_TOURNAMENT_TIMEZONE
  );
  const year = parts.year;
  const month = String(parts.month).padStart(2, "0");
  const day = String(parts.day).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function mapTournamentListItems(
  tournaments: TournamentListDoc[],
): TournamentListItem[] {
  return tournaments.map((t) => ({
    id: t._id.toString(),
    name: t.name,
    logoUrl: t.logoUrl ?? null,
    club: t.club
      ? {
          id: t.club._id.toString(),
          name: t.club.name,
          logoUrl: t.club.logoUrl ?? null,
        }
      : null,
    date: t.date ? formatDateOnlyUtc(t.date, t.timezone) : null,
    status: t.status,
    sponsor: t.sponsor
      ? {
          id: t.sponsor._id.toString(),
          name: t.sponsor.name,
          logoUrl: t.sponsor.logoUrl,
          link: t.sponsor.link,
        }
      : null,
  }));
}
