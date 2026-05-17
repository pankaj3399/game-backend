import type { Types } from "mongoose";
import mongoose from "mongoose";
import User from "../../../models/User";
import Club from "../../../models/Club";
import { findClubIdsForDistanceBand } from "../../tournament/getTournaments/distanceService";
import type { ListClubsQuery } from "./validation";

type LeanHomeClub = {
	_id: Types.ObjectId;
	coordinates?: { type?: string; coordinates?: [number, number] };
};

type LeanUserForClubsList = {
	homeClub?: LeanHomeClub | Types.ObjectId | null;
	favoriteClubs?: Types.ObjectId[];
};

export type ResolveAllowedClubIdsResult =
	| { ok: true; allowedClubIds?: Types.ObjectId[] }
	| { ok: false; status: number; message: string };

function intersectIds(a: Types.ObjectId[], b: Types.ObjectId[]): Types.ObjectId[] {
	const bSet = new Set(b.map((id) => id.toString()));
	return a.filter((id) => bSet.has(id.toString()));
}

function getHomeClubObjectId(user: LeanUserForClubsList): Types.ObjectId | null {
	const home = user.homeClub;
	if (!home) return null;
	if (typeof home === "object" && "_id" in home && (home as LeanHomeClub)._id) {
		return (home as LeanHomeClub)._id;
	}
	if (home instanceof mongoose.Types.ObjectId) {
		return home;
	}
	return null;
}

async function getHomeClubCoordinates(user: LeanUserForClubsList): Promise<[number, number] | null> {
	const home = user.homeClub;
	if (home && typeof home === "object" && "coordinates" in home) {
		const coords = (home as LeanHomeClub).coordinates?.coordinates;
		if (coords && coords.length === 2) {
			return [coords[0], coords[1]];
		}
	}
	const homeId = getHomeClubObjectId(user);
	if (!homeId) return null;
	const doc = await Club.findById(homeId).select("coordinates").lean<{ coordinates?: { coordinates?: [number, number] } }>().exec();
	const coords = doc?.coordinates?.coordinates;
	if (!coords || coords.length !== 2) return null;
	return [coords[0], coords[1]];
}

export async function resolveAllowedClubIdsForList(
	userId: string,
	query: Pick<ListClubsQuery, "clubScope" | "distance">
): Promise<ResolveAllowedClubIdsResult> {
	const { clubScope, distance } = query;

	const user = await User.findById(userId)
		.select("homeClub favoriteClubs")
		.populate({ path: "homeClub", select: "coordinates" })
		.lean<LeanUserForClubsList | null>()
		.exec();

	if (!user) {
		return { ok: false, status: 404, message: "User not found" };
	}

	let scopeIds: Types.ObjectId[] | undefined;
	if (clubScope === "home") {
		const homeId = getHomeClubObjectId(user);
		scopeIds = homeId ? [homeId] : [];
	} else if (clubScope === "favorites") {
		scopeIds = [...(user.favoriteClubs ?? [])];
	}

	let distanceIds: Types.ObjectId[] | undefined;
	if (distance !== "all") {
		const coords = await getHomeClubCoordinates(user);
		if (!coords) {
			return {
				ok: false,
				status: 400,
				message: "A home club is required for distance filtering",
			};
		}

		const idStrings = await findClubIdsForDistanceBand(coords, distance);
		distanceIds = idStrings.map((id) => new mongoose.Types.ObjectId(id));
	}

	if (scopeIds !== undefined && scopeIds.length === 0) {
		return { ok: true, allowedClubIds: [] };
	}

	if (distanceIds !== undefined && distanceIds.length === 0) {
		return { ok: true, allowedClubIds: [] };
	}

	if (scopeIds === undefined && distanceIds === undefined) {
		return { ok: true, allowedClubIds: undefined };
	}

	if (scopeIds !== undefined && distanceIds === undefined) {
		return { ok: true, allowedClubIds: scopeIds };
	}

	if (scopeIds === undefined && distanceIds !== undefined) {
		return { ok: true, allowedClubIds: distanceIds };
	}

	const merged = intersectIds(scopeIds!, distanceIds!);
	return { ok: true, allowedClubIds: merged };
}
