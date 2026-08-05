// List-endpoint pagination wrapper — see Docs/API_STANDARDS.md -> Response
// Envelope. Cross-cutting API convention, not any one module's business
// logic, so it lives in shared/ rather than being redefined per module.
export type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type Paginated<T> = {
  items: T[];
  pagination: Pagination;
};

export function buildPagination(page: number, pageSize: number, total: number): Pagination {
  return {
    page,
    pageSize,
    total,
    totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0,
  };
}
