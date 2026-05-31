import { Types } from "mongoose";
import {
  gameHasRecordedScore,
  selectLiveGame,
  selectNextScheduledGame,
  shouldAdvanceLiveMatchView,
} from "../selection";
import type { LiveMatchGameDoc } from "../types";

function makeGame(overrides: Partial<LiveMatchGameDoc> = {}): LiveMatchGameDoc {
  return {
    _id: new Types.ObjectId(),
    status: "active",
    startTime: new Date("2025-06-01T10:00:00.000Z"),
    matchType: "singles",
    playMode: "1set",
    side1: { players: [] },
    side2: { players: [] },
    score: { playerOneScores: [], playerTwoScores: [] },
    schedule: { matchDurationMinutes: 60 },
    tournament: { duration: 60 },
    ...overrides,
  } as LiveMatchGameDoc;
}

describe("gameHasRecordedScore()", () => {
  it("returns true when any set score is present", () => {
    const game = makeGame({
      score: { playerOneScores: [6], playerTwoScores: [null] },
    });
    expect(gameHasRecordedScore(game)).toBe(true);
  });

  it("returns false for empty scores on active match", () => {
    expect(gameHasRecordedScore(makeGame())).toBe(false);
  });
});

describe("shouldAdvanceLiveMatchView()", () => {
  const now = new Date("2025-06-01T10:40:00.000Z");

  it("returns true when score is recorded", () => {
    const game = makeGame({
      score: { playerOneScores: [6], playerTwoScores: [4] },
    });
    expect(shouldAdvanceLiveMatchView(game, null, now)).toBe(true);
  });

  it("returns false after half duration when no following scheduled match", () => {
    const game = makeGame({
      startTime: new Date("2025-06-01T10:00:00.000Z"),
      schedule: { matchDurationMinutes: 60 } as LiveMatchGameDoc["schedule"],
    });
    expect(shouldAdvanceLiveMatchView(game, null, now)).toBe(false);
  });

  it("returns true for pendingScore awaiting score entry", () => {
    const game = makeGame({ status: "pendingScore" });
    expect(shouldAdvanceLiveMatchView(game, null, now)).toBe(true);
  });

  it("returns true ten minutes after the next match starts (whichever is sooner)", () => {
    const current = makeGame({
      startTime: new Date("2025-06-01T10:00:00.000Z"),
      schedule: { matchDurationMinutes: 120 } as LiveMatchGameDoc["schedule"],
    });
    const next = makeGame({
      _id: new Types.ObjectId(),
      status: "draft",
      startTime: new Date("2025-06-01T10:25:00.000Z"),
    });
    expect(shouldAdvanceLiveMatchView(current, next, now)).toBe(true);
  });

  it("returns false before half duration when next match is far away", () => {
    const current = makeGame({
      startTime: new Date("2025-06-01T10:20:00.000Z"),
      schedule: { matchDurationMinutes: 60 } as LiveMatchGameDoc["schedule"],
    });
    const next = makeGame({
      _id: new Types.ObjectId(),
      status: "draft",
      startTime: new Date("2025-06-01T12:00:00.000Z"),
    });
    expect(shouldAdvanceLiveMatchView(current, next, now)).toBe(false);
  });
});

describe("selectLiveGame()", () => {
  const now = new Date("2025-06-01T10:20:00.000Z");

  it("returns the active unscored match on court", () => {
    const live = makeGame({ status: "active" });
    const next = makeGame({
      _id: new Types.ObjectId(),
      status: "draft",
      startTime: new Date("2025-06-01T11:00:00.000Z"),
    });
    expect(selectLiveGame([live, next], now)?._id.toString()).toBe(live._id.toString());
  });

  it("returns the next scheduled match after score is recorded on pending match", () => {
    const scored = makeGame({
      status: "pendingScore",
      score: { playerOneScores: [6], playerTwoScores: [3] },
    });
    const next = makeGame({
      _id: new Types.ObjectId(),
      status: "draft",
      startTime: new Date("2025-06-01T11:00:00.000Z"),
    });
    expect(selectLiveGame([scored, next], now)?._id.toString()).toBe(next._id.toString());
  });

  it("returns the next scheduled match after roll-forward threshold", () => {
    const stale = makeGame({
      startTime: new Date("2025-06-01T09:00:00.000Z"),
      schedule: { matchDurationMinutes: 60 } as LiveMatchGameDoc["schedule"],
    });
    const next = makeGame({
      _id: new Types.ObjectId(),
      status: "draft",
      startTime: new Date("2025-06-01T11:00:00.000Z"),
    });
    expect(selectLiveGame([stale, next], now)?._id.toString()).toBe(next._id.toString());
  });

  it("promotes an active on-court match when pending-score backlog was advanced", () => {
    const stale = makeGame({
      status: "pendingScore",
      startTime: new Date("2025-06-01T09:00:00.000Z"),
      schedule: { matchDurationMinutes: 60 } as LiveMatchGameDoc["schedule"],
    });
    const nextActive = makeGame({
      _id: new Types.ObjectId(),
      status: "active",
      startTime: new Date("2025-06-01T10:15:00.000Z"),
    });
    expect(selectLiveGame([stale, nextActive], now)?._id.toString()).toBe(
      nextActive._id.toString(),
    );
  });

  it("does not return unscored pendingScore as live when only backlog remains", () => {
    const pending = makeGame({
      status: "pendingScore",
      startTime: new Date("2025-06-01T09:00:00.000Z"),
    });
    expect(selectLiveGame([pending], now)).toBeNull();
  });
});

describe("selectNextScheduledGame()", () => {
  const now = new Date("2025-06-01T10:00:00.000Z");

  it("excludes the focused live game id", () => {
    const focus = makeGame({
      status: "draft",
      startTime: new Date("2025-06-01T11:00:00.000Z"),
    });
    const later = makeGame({
      _id: new Types.ObjectId(),
      status: "draft",
      startTime: new Date("2025-06-01T12:00:00.000Z"),
    });
    expect(
      selectNextScheduledGame([focus, later], now, focus._id.toString())?._id.toString(),
    ).toBe(later._id.toString());
  });
});
