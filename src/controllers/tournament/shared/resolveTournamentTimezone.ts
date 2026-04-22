import tzLookup from "tz-lookup";
import Club from "../../../models/Club";
import {
  DEFAULT_TOURNAMENT_TIMEZONE,
  isValidIanaTimeZone,
} from "../../../shared/timezone";

export class TournamentTimezoneResolutionError extends Error {
  code: "MISSING_COORDINATES" | "INVALID_COORDINATES";

  constructor(
    code: "MISSING_COORDINATES" | "INVALID_COORDINATES",
    message: string
  ) {
    super(message);
    this.name = "TournamentTimezoneResolutionError";
    this.code = code;
  }
}

type ClubCoordinateDoc = {
  coordinates?: {
    coordinates?: [number, number];
  } | null;
} | null;

/**
 * Resolves tournament timezone from club coordinates.
 * Coordinates are stored as [longitude, latitude].
 */
export async function resolveTournamentTimezoneFromClub(
  clubId: string
): Promise<string> {
  const club = await Club.findById(clubId)
    .select("coordinates.coordinates")
    .lean<ClubCoordinateDoc>()
    .exec();

  const coords = club?.coordinates?.coordinates;
  if (!coords || coords.length !== 2) {
    throw new TournamentTimezoneResolutionError(
      "MISSING_COORDINATES",
      "Selected club is missing valid coordinates for timezone resolution"
    );
  }

  const [longitude, latitude] = coords;
  if (
    !Number.isFinite(longitude) ||
    !Number.isFinite(latitude) ||
    longitude < -180 ||
    longitude > 180 ||
    latitude < -90 ||
    latitude > 90
  ) {
    throw new TournamentTimezoneResolutionError(
      "INVALID_COORDINATES",
      "Selected club coordinates are invalid for timezone resolution"
    );
  }

  const timezone = tzLookup(latitude, longitude);
  if (!isValidIanaTimeZone(timezone)) {
    return DEFAULT_TOURNAMENT_TIMEZONE;
  }

  return timezone;
}
