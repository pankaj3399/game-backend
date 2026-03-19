import { z } from "zod";
import { createOrUpdateDraftSchema } from "../../../validation/tournament.schemas";

export { createOrUpdateDraftSchema };
export type UpdateDraftInput = z.infer<typeof createOrUpdateDraftSchema>;
