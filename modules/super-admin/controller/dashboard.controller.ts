import { superAdminDashboardService } from "../service/dashboard.service";
import { successResponse } from "@/shared/utils/api-response";
import { handleRouteError } from "@/shared/errors/handle-route-error";

export const superAdminDashboardController = {
  async getDashboard() {
    try {
      const dashboard = await superAdminDashboardService.getDashboard();
      return successResponse(dashboard, "Dashboard retrieved");
    } catch (error) {
      return handleRouteError(error);
    }
  },
};
