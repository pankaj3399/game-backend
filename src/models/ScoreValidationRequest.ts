import mongoose from "mongoose";
import type { GamePlayMode, MatchType } from "../types/domain/game";

export type ScoreValidationRequestStatus =
  | "pending"
  | "consumed"
  | "expired"
  | "cancelled";

export interface IScoreValidationRequest extends mongoose.Document {
  token: string;
  tokenHash: string;
  requestByUser: mongoose.Types.ObjectId;
  opponentUser?: mongoose.Types.ObjectId | null;
  tournament?: mongoose.Types.ObjectId | null;
  match: mongoose.Types.ObjectId;
  playerOneScores: Array<number | "wo">;
  playerTwoScores: Array<number | "wo">;
  playMode: GamePlayMode;
  matchType: MatchType;
  status: ScoreValidationRequestStatus;
  expiresAt: Date;
  consumedAt?: Date | null;
  consumedBy?: mongoose.Types.ObjectId | null;
  createdAt?: Date;
  updatedAt?: Date;
}

const scoreValueArrayField = {
  type: [mongoose.Schema.Types.Mixed],
  required: true,
  validate: {
    validator(values: unknown[]) {
      return (
        Array.isArray(values) &&
        values.length > 0 &&
        values.every(
          (value) =>
            value === "wo" ||
            (typeof value === "number" &&
              Number.isFinite(value) &&
              Number.isInteger(value) &&
              value >= 0),
        )
      );
    },
    message: 'Each score entry must be a non-negative integer or "wo"',
  },
};

const scoreValidationRequestSchema =
  new mongoose.Schema<IScoreValidationRequest>(
    {
      token: {
        type: String,
        required: true,
        trim: true,
      },
      tokenHash: {
        type: String,
        required: true,
        unique: true,
        index: true,
        trim: true,
      },
      requestByUser: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
      },
      opponentUser: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: false,
        default: null,
        index: true,
      },
      tournament: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Tournament",
        required: false,
        default: null,
        index: true,
      },
      match: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Game",
        required: true,
        index: true,
      },
      playerOneScores: scoreValueArrayField,
      playerTwoScores: scoreValueArrayField,
      playMode: {
        type: String,
        enum: ["TieBreak10", "1set", "3setTieBreak10", "3set", "5set"],
        required: true,
      },
      matchType: {
        type: String,
        enum: ["singles", "doubles"],
        required: true,
      },
      status: {
        type: String,
        enum: ["pending", "consumed", "expired", "cancelled"],
        default: "pending",
        required: true,
        index: true,
      },
      expiresAt: {
        type: Date,
        required: true,
        index: true,
      },
      consumedAt: {
        type: Date,
        default: null,
      },
      consumedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
    },
    {
      timestamps: true,
    },
  );

scoreValidationRequestSchema.pre(
  "validate",
  function scoreValidationRequestPreValidate() {
    const requestBy = this.requestByUser ? String(this.requestByUser) : null;
    const opponent = this.opponentUser ? String(this.opponentUser) : null;

    if (requestBy && opponent && requestBy === opponent) {
      this.invalidate(
        "opponentUser",
        "opponentUser must be different from requestByUser",
      );
    }

    if (
      !Array.isArray(this.playerOneScores) ||
      !Array.isArray(this.playerTwoScores)
    ) {
      this.invalidate("playerOneScores", "Scores must be arrays");
      this.invalidate("playerTwoScores", "Scores must be arrays");
      return;
    }

    if (this.playerOneScores.length !== this.playerTwoScores.length) {
      this.invalidate(
        "playerTwoScores",
        "playerOneScores and playerTwoScores must have the same length",
      );
    }

    if (this.playerOneScores.length === 0) {
      this.invalidate("playerOneScores", "At least one set score is required");
    }

    for (let i = 0; i < this.playerOneScores.length; i += 1) {
      const one = this.playerOneScores[i];
      const two = this.playerTwoScores[i];

      if (one === "wo" && two === "wo") {
        this.invalidate(
          `playerTwoScores.${i}`,
          'Both sides cannot be "wo" in the same set when generating opponent validation request',
        );
      }
    }

    if (this.status === "consumed") {
      if (!this.consumedAt) {
        this.invalidate(
          "consumedAt",
          "consumedAt is required when status is consumed",
        );
      }
      if (!this.consumedBy) {
        this.invalidate(
          "consumedBy",
          "consumedBy is required when status is consumed",
        );
      }
    } else if (this.consumedAt != null || this.consumedBy != null) {
      this.invalidate(
        "status",
        "consumedAt/consumedBy may only be set when status is consumed",
      );
    }
  },
);

scoreValidationRequestSchema.index({ tokenHash: 1, status: 1, expiresAt: 1 });

scoreValidationRequestSchema.index(
  { match: 1, requestByUser: 1, opponentUser: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: "pending",
      opponentUser: { $type: "objectId" },
    },
  },
);

scoreValidationRequestSchema.index(
  { match: 1, requestByUser: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "pending", opponentUser: null },
  },
);

scoreValidationRequestSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const ScoreValidationRequest = mongoose.model<IScoreValidationRequest>(
  "ScoreValidationRequest",
  scoreValidationRequestSchema,
);

export default ScoreValidationRequest;
