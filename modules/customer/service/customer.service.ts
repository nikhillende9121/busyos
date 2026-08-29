import type { Customer } from "@prisma/client";
import { customerRepository } from "../repository/customer.repository";
import { AppError } from "@/shared/errors/app-error";
import { buildPagination, type Paginated } from "@/shared/utils/pagination";
import type { CreateCustomerDto, UpdateCustomerDto, CustomerListDto, CustomerExportDto } from "../dto/customer.dto";
import type { CustomerView } from "../types/customer.types";

export const customerService = {
  async list(filter: CustomerListDto): Promise<Paginated<CustomerView>> {
    const repoFilter = { dateFrom: filter.dateFrom, dateTo: filter.dateTo };
    const skip = (filter.page - 1) * filter.pageSize;
    const [customers, total] = await Promise.all([
      customerRepository.findManyByTenant(filter.tenantId, { ...repoFilter, skip, take: filter.pageSize }),
      customerRepository.countByTenant(filter.tenantId, repoFilter),
    ]);
    return {
      items: customers.map(toCustomerView),
      pagination: buildPagination(filter.page, filter.pageSize, total),
    };
  },

  // Same filter as list(), but every matching row — no page/pageSize — for
  // GET /customers/export.
  async exportList(filter: CustomerExportDto): Promise<CustomerView[]> {
    const customers = await customerRepository.findManyByTenant(filter.tenantId, {
      dateFrom: filter.dateFrom,
      dateTo: filter.dateTo,
    });
    return customers.map(toCustomerView);
  },

  async getById(tenantId: bigint, customerId: bigint): Promise<CustomerView> {
    const customer = await customerRepository.findByIdForTenant(tenantId, customerId);
    if (!customer) {
      throw new AppError("RESOURCE_NOT_FOUND", "Customer not found");
    }
    return toCustomerView(customer);
  },

  async create(dto: CreateCustomerDto): Promise<CustomerView> {
    if (dto.customerGroupId !== undefined) {
      await assertCustomerGroupBelongsToTenant(dto.tenantId, dto.customerGroupId);
    }
    const customer = await customerRepository.create({
      tenantId: dto.tenantId,
      name: dto.name,
      email: dto.email,
      phone: dto.phone,
      customerGroupId: dto.customerGroupId,
      state: dto.state,
    });
    return toCustomerView(customer);
  },

  async update(dto: UpdateCustomerDto): Promise<CustomerView> {
    const existing = await customerRepository.findByIdForTenant(dto.tenantId, dto.customerId);
    if (!existing) {
      throw new AppError("RESOURCE_NOT_FOUND", "Customer not found");
    }
    if (dto.customerGroupId !== undefined) {
      await assertCustomerGroupBelongsToTenant(dto.tenantId, dto.customerGroupId);
    }
    const customer = await customerRepository.update(dto.customerId, {
      name: dto.name,
      email: dto.email,
      phone: dto.phone,
      customerGroupId: dto.customerGroupId,
      state: dto.state,
    });
    return toCustomerView(customer);
  },

  async remove(tenantId: bigint, customerId: bigint): Promise<void> {
    const existing = await customerRepository.findByIdForTenant(tenantId, customerId);
    if (!existing) {
      throw new AppError("RESOURCE_NOT_FOUND", "Customer not found");
    }
    const inUse = await customerRepository.hasSales(customerId);
    if (inUse) {
      throw new AppError("CONFLICT", "Cannot delete a customer that has existing sales");
    }
    await customerRepository.softDelete(customerId);
  },
};

async function assertCustomerGroupBelongsToTenant(tenantId: bigint, customerGroupId: bigint): Promise<void> {
  const group = await customerRepository.findCustomerGroupForTenant(tenantId, customerGroupId);
  if (!group) {
    throw new AppError("VALIDATION_ERROR", "customerGroupId does not belong to this tenant");
  }
}

function toCustomerView(customer: Customer): CustomerView {
  return {
    id: customer.id.toString(),
    name: customer.name,
    email: customer.email,
    phone: customer.phone,
    customerGroupId: customer.customerGroupId?.toString() ?? null,
    state: customer.state,
    createdAt: customer.createdAt.toISOString(),
    updatedAt: customer.updatedAt.toISOString(),
  };
}
