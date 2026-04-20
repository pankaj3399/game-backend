import type { Types } from "mongoose";

/**
 * Lean `schedule` subdocument after `populate('schedule', …)` on Tournament.
 * `_id` is always present on populated paths.
 */
export interface SchedulePopulatedLean {
  _id: Types.ObjectId;
  currentRound?: number;
  rounds?: Array<{ round?: number }>;
}

