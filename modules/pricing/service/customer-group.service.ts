import type { CustomerGroup } from "@prisma/client";
import { customerGroupRepository } from "../repository/customer-group.repository";
import { AppError } from "@/shared/errors/app-error";
import type { CreateCustomerGroupDto, UpdateCustomerGroupDto } from "../dto/customer-group.dto";
import type { CustomerGroupView } from "../types/customer-group.types";

export const customerGroupService = {
  async list(tenantId: bigint): Promise<CustomerGroupView[]> {
    const groups = await customerGroupRepository.findManyByTenant(tenantId);
    return groups.map(toCustomerGroupView);
  },

  async getById(tenantId: bigint, customerGroupId: bigint): Promise<CustomerGroupView> {
    const group = await customerGroupRepository.findByIdForTenant(tenantId, customerGroupId);
    if (!group) {
      throw new AppError("RESOURCE_NOT_FOUND", "Customer group not found");
    }
    return toCustomerGroupView(group);
  },

  async create(dto: CreateCustomerGroupDto): Promise<CustomerGroupView> {
    const group = await customerGroupRepository.create({
      tenantId: dto.tenantId,
      name: dto.name,
      code: dto.code,
    });
    return toCustomerGroupView(group);
  },

  async update(dto: UpdateCustomerGroupDto): Promise<CustomerGroupView> {
    const existing = await customerGroupRepository.findByIdForTenant(dto.tenantId, dto.customerGroupId);
    if (!existing) {
      throw new AppError("RESOURCE_NOT_FOUND", "Customer group not found");
    }
    const group = await customerGroupRepository.update(dto.customerGroupId, {
      name: dto.name,
      code: dto.code,
    });
    return toCustomerGroupView(group);
  },

  async remove(tenantId: bigint, customerGroupId: bigint): Promise<void> {
    const existing = await customerGroupRepository.findByIdForTenant(tenantId, customerGroupId);
    if (!existing) {
      throw new AppError("RESOURCE_NOT_FOUND", "Customer group not found");
    }
    const [hasCustomers, hasPriceLists, hasDiscounts, hasCoupons] = await Promise.all([
      customerGroupRepository.hasCustomers(customerGroupId),
      customerGroupRepository.hasPriceLists(customerGroupId),
      customerGroupRepository.hasDiscounts(customerGroupId),
      customerGroupRepository.hasCoupons(customerGroupId),
    ]);
    if (hasCustomers || hasPriceLists || hasDiscounts || hasCoupons) {
      throw new AppError(
        "CONFLICT",
        "Cannot delete a customer group that still has customers, price lists, discounts, or coupons",
      );
    }
    await customerGroupRepository.hardDelete(customerGroupId);
  },
};

function toCustomerGroupView(group: CustomerGroup): CustomerGroupView {
  return {
    id: group.id.toString(),
    name: group.name,
    code: group.code,
    createdAt: group.createdAt.toISOString(),
    updatedAt: group.updatedAt.toISOString(),
  };
}
