import type { Types } from "mongoose";
import type { ScheduleParticipantInfo, ScheduleMode } from "../shared/types";

interface SinglesMatchPair {
  kind: "singles";
  teamOne: [Types.ObjectId];
  teamTwo: [Types.ObjectId];
}

interface DoublesMatchPair {
  kind: "doubles";
  teamOne: [Types.ObjectId, Types.ObjectId];
  teamTwo: [Types.ObjectId, Types.ObjectId];
}

export type MatchPair = SinglesMatchPair | DoublesMatchPair;

export function ensureMinimumParticipants(mode: ScheduleMode, count: number) {
  if (mode === "singles" && count < 2) {
    throw new Error("At least two participants are required for singles scheduling");
  }
  if (mode === "doubles" && count < 4) {
    throw new Error("At least four participants are required for doubles scheduling");
  }
}

function selectExtraRecipients(participantIds: string[], extrasNeeded: number, roundSeed: number) {
  if (extrasNeeded <= 0 || participantIds.length === 0) {
    return [] as string[];
  }

  const indexed = participantIds.map((id, index) => ({ id, index, rotated: 0 }));
  const seed = ((Math.trunc(roundSeed) % participantIds.length) + participantIds.length) % participantIds.length;

  for (const item of indexed) {
    item.rotated = (item.index - seed + participantIds.length) % participantIds.length;
  }

  indexed.sort((left, right) => left.rotated - right.rotated || left.id.localeCompare(right.id));

  return indexed.slice(0, Math.min(extrasNeeded, indexed.length)).map((item) => item.id);
}

function getDemandForRound(
  participants: ScheduleParticipantInfo[],
  mode: ScheduleMode,
  matchesPerPlayer: number,
  roundSeed: number
) {
  const participantIds = participants.map((participant) => participant._id.toString());
  const demandById = new Map<string, number>();
  for (const participantId of participantIds) {
    demandById.set(participantId, matchesPerPlayer);
  }

  const baseAppearances = participantIds.length * matchesPerPlayer;
  const bucketSize = mode === "singles" ? 2 : 4;
  let extrasNeeded = (bucketSize - (baseAppearances % bucketSize)) % bucketSize;

  if (mode === "singles" && participantIds.length % 2 === 1) {
    extrasNeeded = extrasNeeded === 0 ? 1 : extrasNeeded;
    if ((baseAppearances + extrasNeeded) % bucketSize !== 0) {
      extrasNeeded += 1;
    }
  }

  const extraRecipients = selectExtraRecipients(participantIds, extrasNeeded, roundSeed);

  for (const playerId of extraRecipients) {
    const current = demandById.get(playerId) ?? matchesPerPlayer;
    demandById.set(playerId, current + 1);
  }

  return {
    demandById,
    totalAppearances: [...demandById.values()].reduce((sum, value) => sum + value, 0),
  };
}

function nextHighestDemand(
  demandById: Map<string, number>,
  participantIndex: Map<string, number>,
  excluded: Set<string>,
  preferredPairKey?: string,
  pairCounts?: Map<string, number>
) {
  const candidates = [...demandById.entries()]
    .filter(([id, demand]) => demand > 0 && !excluded.has(id))
    .map(([id, demand]) => ({ id, demand }));

  candidates.sort((left, right) => {
    if (left.demand !== right.demand) {
      return right.demand - left.demand;
    }

    if (preferredPairKey && pairCounts) {
      const leftPairCount =
        pairCounts.get(`${preferredPairKey}:${left.id}`) ?? pairCounts.get(`${left.id}:${preferredPairKey}`) ?? 0;
      const rightPairCount =
        pairCounts.get(`${preferredPairKey}:${right.id}`) ?? pairCounts.get(`${right.id}:${preferredPairKey}`) ?? 0;
      if (leftPairCount !== rightPairCount) {
        return leftPairCount - rightPairCount;
      }
    }

    const leftIndex = participantIndex.get(left.id) ?? Number.MAX_SAFE_INTEGER;
    const rightIndex = participantIndex.get(right.id) ?? Number.MAX_SAFE_INTEGER;
    if (leftIndex !== rightIndex) {
      return leftIndex - rightIndex;
    }

    return left.id.localeCompare(right.id);
  });

  return candidates[0]?.id ?? null;
}

function decrementDemand(demandById: Map<string, number>, playerId: string) {
  const next = (demandById.get(playerId) ?? 0) - 1;
  if (next <= 0) {
    demandById.delete(playerId);
    return;
  }
  demandById.set(playerId, next);
}

function pairSinglesFromDemand(participants: ScheduleParticipantInfo[], demandById: Map<string, number>) {
  const byId = new Map(participants.map((participant) => [participant._id.toString(), participant]));
  const participantIndex = new Map(participants.map((participant, index) => [participant._id.toString(), index]));
  const pairCounts = new Map<string, number>();
  const pairs: SinglesMatchPair[] = [];

  while (demandById.size > 0) {
    const playerOneId = nextHighestDemand(demandById, participantIndex, new Set<string>());
    if (!playerOneId) {
      break;
    }

    const playerTwoId = nextHighestDemand(
      demandById,
      participantIndex,
      new Set([playerOneId]),
      playerOneId,
      pairCounts
    );

    if (!playerTwoId) {
      throw new Error("Unable to complete singles pairing with current constraints");
    }

    const playerOne = byId.get(playerOneId);
    const playerTwo = byId.get(playerTwoId);
    if (!playerOne || !playerTwo) {
      throw new Error("Unable to resolve singles participants for pairing");
    }

    pairs.push({
      kind: "singles",
      teamOne: [playerOne._id],
      teamTwo: [playerTwo._id],
    });

    decrementDemand(demandById, playerOneId);
    decrementDemand(demandById, playerTwoId);

    const key = playerOneId < playerTwoId ? `${playerOneId}:${playerTwoId}` : `${playerTwoId}:${playerOneId}`;
    pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
  }

  return pairs;
}

function pairDoublesFromDemand(participants: ScheduleParticipantInfo[], demandById: Map<string, number>) {
  const byId = new Map(participants.map((participant) => [participant._id.toString(), participant]));
  const participantIndex = new Map(participants.map((participant, index) => [participant._id.toString(), index]));
  const pairs: DoublesMatchPair[] = [];

  while (demandById.size > 0) {
    const selected: string[] = [];
    for (let i = 0; i < 4; i += 1) {
      const next = nextHighestDemand(demandById, participantIndex, new Set(selected));
      if (!next) {
        throw new Error("Unable to complete doubles pairing with current constraints");
      }
      selected.push(next);
    }

    const [a, b, c, d] = selected;
    const playerA = byId.get(a);
    const playerB = byId.get(b);
    const playerC = byId.get(c);
    const playerD = byId.get(d);

    if (!playerA || !playerB || !playerC || !playerD) {
      throw new Error("Unable to resolve doubles participants for pairing");
    }

    pairs.push({
      kind: "doubles",
      teamOne: [playerA._id, playerD._id],
      teamTwo: [playerB._id, playerC._id],
    });

    decrementDemand(demandById, a);
    decrementDemand(demandById, b);
    decrementDemand(demandById, c);
    decrementDemand(demandById, d);
  }

  return pairs;
}

export function buildRoundPairs(
  participants: ScheduleParticipantInfo[],
  mode: ScheduleMode,
  matchesPerPlayer: number,
  round: number
) {
  const { demandById, totalAppearances } = getDemandForRound(participants, mode, matchesPerPlayer, round);

  const bucket = mode === "singles" ? 2 : 4;
  if (totalAppearances % bucket !== 0) {
    throw new Error("Unable to distribute matches per player with current participants");
  }

  const pairs =
    mode === "singles"
      ? pairSinglesFromDemand(participants, demandById)
      : pairDoublesFromDemand(participants, demandById);

  return { pairs };
}
