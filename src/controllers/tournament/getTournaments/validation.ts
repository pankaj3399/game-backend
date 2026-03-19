import { z } from "zod";
export const getTournamentQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(50).optional().default(10),
  status: z.enum(["active", "inactive", "draft"]).optional(),
  q: z.string().optional(),
  view: z.enum(["published", "drafts"]).optional(),
});

export type GetTournamentQuery = z.infer<typeof getTournamentQuerySchema>;
