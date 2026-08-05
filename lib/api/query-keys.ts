// A small key factory so every hook/component invalidates the same cache
// entries consistently — e.g. after a mutation on "warehouses", we can
// invalidate queryKeys.list("warehouses") without every caller needing to
// know the exact array shape.
export const queryKeys = {
  me: ["me"] as const,
  list: (resource: string, params?: Record<string, unknown>) =>
    params ? ([resource, "list", params] as const) : ([resource, "list"] as const),
  detail: (resource: string, id: string) => [resource, "detail", id] as const,
};
