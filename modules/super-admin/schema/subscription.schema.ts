import { z } from "zod";
import { idString } from "@/shared/validation/id";

export const createContractSchema = z
  .object({
    planId: idString,
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
  })
  .refine((data) => data.endDate > data.startDate, {
    message: "endDate must be after startDate",
    path: ["endDate"],
  });
export type CreateContractInput = z.infer<typeof createContractSchema>;
