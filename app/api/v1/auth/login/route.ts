import type { NextRequest } from "next/server";
import { authController } from "@/modules/auth/controller/auth.controller";

export async function POST(request: NextRequest) {
  return authController.login(request);
}
