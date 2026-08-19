// DTOs isolate the service from the HTTP/Zod layer — the controller maps a
// validated request into these before calling the service, so the service
// never depends on `schema/` or on a Request object (see MODULES.md -> dto/).
export type LoginDto = {
  email: string;
  password: string;
};

export type RefreshDto = {
  refreshToken: string;
};
