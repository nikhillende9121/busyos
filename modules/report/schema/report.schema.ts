import { z } from "zod";

// Unlike shared/validation/list-query.ts's dateRangeQueryFields, both ends
// are required here — a GST report with no period is meaningless, whereas
// an open-ended list filter is a legitimate "show everything" query.
export const gstReportQuerySchema = z.object({
  dateFrom: z.coerce.date(),
  dateTo: z.coerce.date(),
});
