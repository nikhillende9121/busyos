import { z } from "zod";
import { optionalIdString } from "@/shared/validation/id";
import { paginationQueryFields } from "@/shared/validation/list-query";

// Read-only report filters — see Docs/batch_expiry_tracking_plan.md §12.
// No create/update here: a ProductBatch is only ever created/mutated as a
// side effect of receiving a purchase, selling, transferring, or
// adjusting — never directly.
export const listProductBatchesQuerySchema = z.object({
  warehouseId: optionalIdString,
  productId: optionalIdString,
  // Only batches expiring within this many days from now (inclusive) —
  // omit for every batch with quantity > 0 regardless of expiry.
  expiringWithinDays: z.coerce.number().int().min(0).optional(),
  ...paginationQueryFields,
});
export type ListProductBatchesQuery = z.infer<typeof listProductBatchesQuerySchema>;
