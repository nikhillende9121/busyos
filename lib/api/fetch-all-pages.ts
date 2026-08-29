import type { Paginated } from "@/shared/utils/pagination";

// For callers that need the COMPLETE result set for a filter — GST/insight
// aggregation, never a picker or a rendered table — where silently capping
// at one page would understate a tax or revenue total. Loops at the list
// endpoint's own max pageSize until every page has been fetched. Prefer a
// server-side date range on `fetchPage` to keep the page count bounded;
// this is not meant for a truly unbounded, un-filtered resource.
export async function fetchAllPages<T>(fetchPage: (page: number) => Promise<Paginated<T>>): Promise<T[]> {
  const items: T[] = [];
  let page = 1;
  for (;;) {
    const result = await fetchPage(page);
    items.push(...result.items);
    if (page >= result.pagination.totalPages) {
      return items;
    }
    page++;
  }
}
