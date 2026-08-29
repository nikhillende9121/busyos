import type { NextRequest } from "next/server";
import {
  createProductSchema,
  updateProductSchema,
  listProductsQuerySchema,
  exportProductsQuerySchema,
} from "../schema/product.schema";
import { productService } from "../service/product.service";
import { successResponse, csvResponse } from "@/shared/utils/api-response";
import { handleRouteError } from "@/shared/errors/handle-route-error";
import { toCsv } from "@/shared/utils/csv";
import { idString } from "@/shared/validation/id";
import type { AuthContext } from "@/shared/middleware/with-api-auth";

type ProductParams = { id: string };

// Receive request -> parse -> call service -> return response. No Prisma,
// no business rules here (see MODULES.md -> controller/). `auth` is
// injected by shared/middleware/with-api-auth.ts.
export const productController = {
  async list(request: NextRequest, auth: AuthContext) {
    try {
      const query = listProductsQuerySchema.parse(
        Object.fromEntries(request.nextUrl.searchParams),
      );
      const result = await productService.list({
        tenantId: auth.tenantId,
        page: query.page,
        pageSize: query.pageSize,
        sortBy: query.sortBy,
        sortDir: query.sortDir,
        status: query.status,
        categoryId: query.categoryId ? BigInt(query.categoryId) : undefined,
        search: query.search,
        warehouseId: query.warehouseId ? BigInt(query.warehouseId) : undefined,
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
        scopedWarehouseId: auth.warehouseId,
        all: query.all,
      });
      return successResponse(result, "Products retrieved");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  // Every row matching the same filters as list(), as a CSV file — see
  // Docs/API_STANDARDS.md -> List Export.
  async exportList(request: NextRequest, auth: AuthContext) {
    try {
      const query = exportProductsQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
      const products = await productService.exportList({
        tenantId: auth.tenantId,
        status: query.status,
        categoryId: query.categoryId ? BigInt(query.categoryId) : undefined,
        search: query.search,
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
        warehouseId: query.warehouseId ? BigInt(query.warehouseId) : undefined,
        scopedWarehouseId: auth.warehouseId,
        all: query.all,
      });
      const csv = toCsv(products, [
        { key: "id", header: "Product #" },
        { key: "sku", header: "SKU" },
        { key: "barcode", header: "Barcode" },
        { key: "name", header: "Name" },
        { key: "status", header: "Status" },
        { key: "createdAt", header: "Created" },
      ]);
      return csvResponse(csv, `products-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async getById(_request: NextRequest, auth: AuthContext, params: ProductParams) {
    try {
      const id = idString.parse(params.id);
      const product = await productService.getById(auth.tenantId, BigInt(id));
      return successResponse(product, "Product retrieved");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async create(request: NextRequest, auth: AuthContext) {
    try {
      const body = await request.json();
      const input = createProductSchema.parse(body);
      const product = await productService.create({
        tenantId: auth.tenantId,
        sku: input.sku,
        barcode: input.barcode,
        name: input.name,
        categoryId: input.categoryId ? BigInt(input.categoryId) : undefined,
        brandId: input.brandId ? BigInt(input.brandId) : undefined,
        unitId: input.unitId ? BigInt(input.unitId) : undefined,
        taxRateId: input.taxRateId ? BigInt(input.taxRateId) : undefined,
        status: input.status,
        createdBy: auth.userId,
      });
      return successResponse(product, "Product created", 201);
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async update(request: NextRequest, auth: AuthContext, params: ProductParams) {
    try {
      const id = idString.parse(params.id);
      const body = await request.json();
      const input = updateProductSchema.parse(body);
      const product = await productService.update({
        tenantId: auth.tenantId,
        productId: BigInt(id),
        sku: input.sku,
        barcode: input.barcode,
        name: input.name,
        categoryId: input.categoryId ? BigInt(input.categoryId) : undefined,
        brandId: input.brandId ? BigInt(input.brandId) : undefined,
        unitId: input.unitId ? BigInt(input.unitId) : undefined,
        taxRateId: input.taxRateId ? BigInt(input.taxRateId) : undefined,
        status: input.status,
        updatedBy: auth.userId,
      });
      return successResponse(product, "Product updated");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async remove(_request: NextRequest, auth: AuthContext, params: ProductParams) {
    try {
      const id = idString.parse(params.id);
      await productService.remove(auth.tenantId, BigInt(id), auth.userId);
      // 200 with an envelope rather than a bare 204: Docs/API_STANDARDS.md's
      // "every response uses the same shape" rule takes priority over the
      // 204-status-code suggestion, and 204 responses can't carry a body.
      return successResponse(null, "Product deleted");
    } catch (error) {
      return handleRouteError(error);
    }
  },
};
