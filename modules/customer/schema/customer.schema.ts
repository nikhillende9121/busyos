import { z } from "zod";
import { idString, optionalIdString } from "@/shared/validation/id";
import { paginationQueryFields, dateRangeQueryFields } from "@/shared/validation/list-query";

export const createCustomerSchema = z.object({
  name: z.string().min(1).max(150),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().max(30).optional(),
  customerGroupId: optionalIdString,
  // Billing state — see modules/pricing/service/tax.service.ts's
  // CGST+SGST-vs-IGST split.
  state: z.string().max(50).optional(),
});
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

export const updateCustomerSchema = createCustomerSchema.partial();
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

// dateFrom/dateTo filter on createdAt (see
// modules/customer/repository/customer.repository.ts).
export const listCustomersQuerySchema = z.object({
  ...paginationQueryFields,
  ...dateRangeQueryFields,
});
export type ListCustomersQuery = z.infer<typeof listCustomersQuerySchema>;

// Same filters as the list, minus pagination — see Docs/API_STANDARDS.md -> List Export.
export const exportCustomersQuerySchema = z.object({
  ...dateRangeQueryFields,
});
export type ExportCustomersQuery = z.infer<typeof exportCustomersQuerySchema>;
