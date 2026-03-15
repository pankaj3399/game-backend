import type { TournamentListDoc } from "../../../types/api/tournament";

export interface TournamentListItem {
  id: unknown;
  name: string;
  club: { id: unknown; name: string } | null;
  date: string | null;
  status: string;
  sponsor: {
    id: string;
    name: string;
    logoUrl?: string | null;
    link?: string | null;
  } | null;
}

export function mapTournamentListItems(tournaments: TournamentListDoc[]) {
  return tournaments.map((t) => ({
    id: t._id,
    name: t.name,
    club: t.club ? { id: t.club._id, name: t.club.name } : null,
    date: t.date ? new Date(t.date).toISOString() : null,
    status: t.status,
    sponsor: t.sponsorId
      ? {
          id: t.sponsorId._id.toString(),
          name: t.sponsorId.name,
          logoUrl: t.sponsorId.logoUrl,
          link: t.sponsorId.link,
        }
      : null,
  }));
}
