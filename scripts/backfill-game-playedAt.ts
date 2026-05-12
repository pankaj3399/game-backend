/**
 * One-shot backfill: set Game.playedAt from endTime → startTime → createdAt (epoch if all missing).
 * Run after deploying the playedAt field so my-score queries can use the indexed column.
 *
 * Usage: `yarn migrate:playedAt` (requires MONGODB_URI in env).
 */
import mongoose from "mongoose";
import { connectToDatabase } from "../src/lib/db";
import Game from "../src/models/Game";

async function main(): Promise<void> {
  await connectToDatabase();
  const epoch = new Date(0);
  const result = await Game.collection.updateMany(
    {
      $or: [{ playedAt: { $exists: false } }, { playedAt: null }],
    },
    [
      {
        $set: {
          playedAt: {
            $ifNull: ["$endTime", { $ifNull: ["$startTime", { $ifNull: ["$createdAt", epoch] }] }],
          },
        },
      },
    ],
  );
  console.log(
    `backfill-game-playedAt: matched=${result.matchedCount} modified=${result.modifiedCount}`,
  );
  await mongoose.disconnect();
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
