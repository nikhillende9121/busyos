import { z } from "zod";

// Spread into a resource's own list-query schema (see
// modules/product/schema/product.schema.ts's listProductsQuerySchema for
// the pattern this generalizes) — not a standalone schema, since every
// resource still has its own filters alongside these.
export const paginationQueryFields = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
};

// Filters on whatever the resource's own natural date field is (saleDate,
// purchaseDate, createdAt, ...) — the resource's repository decides which
// column, this only validates the range itself. Both ends optional: either
// can be omitted for an open-ended range.
export const dateRangeQueryFields = {
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
};
