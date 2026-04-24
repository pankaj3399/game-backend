import { z } from "zod";
import { updateDraftSchema } from "../../../validation/tournament.schemas";

export { updateDraftSchema };
export type UpdateDraftInput = z.infer<typeof updateDraftSchema>;
export type UpdateTournamentPersistenceInput = UpdateDraftInput & {
  timezone?: string | null;
};
