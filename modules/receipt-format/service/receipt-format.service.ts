import type { ReceiptFormat, ReceiptFormatAssignment } from "@prisma/client";
import { prisma } from "@/shared/database/prisma";
import { receiptFormatRepository } from "../repository/receipt-format.repository";
import { AppError } from "@/shared/errors/app-error";
import type {
  CreateReceiptFormatDto,
  UpdateReceiptFormatDto,
  CloneReceiptFormatDto,
  AssignReceiptFormatDto,
} from "../dto/receipt-format.dto";
import type {
  ReceiptFormatView,
  ReceiptFormatSchemaJson,
  ResolvedReceiptFormatView,
  ResolvedReceiptFormatVersionView,
} from "../types/receipt-format.types";

type ReceiptFormatWithAssignments = ReceiptFormat & { assignments: ReceiptFormatAssignment[] };

export const receiptFormatService = {
  async list(): Promise<ReceiptFormatView[]> {
    const formats = await receiptFormatRepository.findMany();
    return formats.map(toView);
  },

  async getById(id: bigint): Promise<ReceiptFormatView> {
    const format = await receiptFormatRepository.findById(id);
    if (!format) {
      throw new AppError("RESOURCE_NOT_FOUND", "Receipt format not found");
    }
    return toView(format);
  },

  async create(dto: CreateReceiptFormatDto): Promise<ReceiptFormatView> {
    const created = await prisma.$transaction(async (tx) => {
      const format = await receiptFormatRepository.create(tx, {
        name: dto.name,
        paperWidth: dto.paperWidth,
        schema: dto.schema as never,
        isDefault: dto.isDefault,
        createdBy: dto.createdBy,
      });
      if (dto.isDefault) {
        await receiptFormatRepository.clearDefaultExcept(tx, format.id);
      }
      return format;
    });

    return this.getById(created.id);
  },

  // Full replace of name/paperWidth/schema/isDefault, plus a version bump —
  // the Android app's cheap cache-invalidation signal (see
  // Docs/pos_receipt_format_guide.md, GET .../receipt-format/version).
  async update(dto: UpdateReceiptFormatDto): Promise<ReceiptFormatView> {
    const existing = await receiptFormatRepository.findById(dto.formatId);
    if (!existing) {
      throw new AppError("RESOURCE_NOT_FOUND", "Receipt format not found");
    }

    await prisma.$transaction(async (tx) => {
      await receiptFormatRepository.update(tx, dto.formatId, {
        name: dto.name,
        paperWidth: dto.paperWidth,
        schema: dto.schema as never,
        isDefault: dto.isDefault,
        version: { increment: 1 },
      });
      if (dto.isDefault) {
        await receiptFormatRepository.clearDefaultExcept(tx, dto.formatId);
      }
    });

    return this.getById(dto.formatId);
  },

  async remove(id: bigint): Promise<void> {
    const existing = await receiptFormatRepository.findById(id);
    if (!existing) {
      throw new AppError("RESOURCE_NOT_FOUND", "Receipt format not found");
    }
    await prisma.$transaction(async (tx) => {
      await receiptFormatRepository.softDelete(tx, id);
    });
  },

  // Duplicates an existing format's schema/paperWidth as a starting point
  // for a new one — never the source format's isDefault flag or
  // assignments, so cloning can never silently steal the source's role.
  async clone(dto: CloneReceiptFormatDto): Promise<ReceiptFormatView> {
    const source = await receiptFormatRepository.findById(dto.sourceId);
    if (!source) {
      throw new AppError("RESOURCE_NOT_FOUND", "Receipt format not found");
    }
    const created = await receiptFormatRepository.create(prisma, {
      name: dto.name,
      paperWidth: source.paperWidth,
      schema: source.schema as never,
      isDefault: false,
      createdBy: dto.createdBy,
    });
    return this.getById(created.id);
  },

  async assign(dto: AssignReceiptFormatDto): Promise<ReceiptFormatView> {
    const format = await receiptFormatRepository.findById(dto.formatId);
    if (!format) {
      throw new AppError("RESOURCE_NOT_FOUND", "Receipt format not found");
    }

    if (dto.terminalId !== undefined) {
      const terminal = await receiptFormatRepository.findTerminalById(dto.terminalId);
      if (!terminal) {
        throw new AppError("RESOURCE_NOT_FOUND", "POS device not found");
      }
      await receiptFormatRepository.upsertTerminalAssignment(dto.formatId, dto.terminalId);
    } else if (dto.warehouseId !== undefined) {
      const warehouse = await receiptFormatRepository.findWarehouseById(dto.warehouseId);
      if (!warehouse) {
        throw new AppError("RESOURCE_NOT_FOUND", "Store not found");
      }
      await receiptFormatRepository.upsertWarehouseAssignment(dto.formatId, dto.warehouseId);
    } else if (dto.tenantId !== undefined) {
      const tenant = await receiptFormatRepository.findTenantById(dto.tenantId);
      if (!tenant) {
        throw new AppError("RESOURCE_NOT_FOUND", "Tenant not found");
      }
      await receiptFormatRepository.upsertTenantAssignment(dto.formatId, dto.tenantId);
    } else {
      throw new AppError("VALIDATION_ERROR", "Exactly one of tenantId, warehouseId, or terminalId is required");
    }

    return this.getById(dto.formatId);
  },

  // Precedence: the POS device's own assignment wins, then its store's,
  // then its tenant's, then whichever format is the global default. This
  // is what lets a Super Admin assign a format tenant-wide with one call
  // and still override it for a single misbehaving printer later without
  // touching the tenant-wide assignment. See
  // Docs/pos_receipt_format_guide.md's "Format Resolution Logic".
  async resolveForTerminal(terminalId: bigint, tenantId: bigint): Promise<ResolvedReceiptFormatView> {
    const terminal = await receiptFormatRepository.findTerminalById(terminalId);
    if (!terminal || terminal.tenantId !== tenantId) {
      throw new AppError("RESOURCE_NOT_FOUND", "POS device not found");
    }

    const format = await resolveFormatFor(terminal.id, terminal.warehouseId, tenantId);
    if (!format) {
      throw new AppError("RESOURCE_NOT_FOUND", "No receipt format configured");
    }

    return {
      formatId: format.id.toString(),
      name: format.name,
      version: format.version,
      paperWidth: format.paperWidth,
      schema: format.schema as unknown as ReceiptFormatSchemaJson,
    };
  },

  async resolveVersionForTerminal(terminalId: bigint, tenantId: bigint): Promise<ResolvedReceiptFormatVersionView> {
    const resolved = await this.resolveForTerminal(terminalId, tenantId);
    return { version: resolved.version };
  },
};

async function resolveFormatFor(
  terminalId: bigint,
  warehouseId: bigint,
  tenantId: bigint,
): Promise<ReceiptFormat | null> {
  const terminalAssignment = await receiptFormatRepository.findAssignmentByTerminal(terminalId);
  if (terminalAssignment) return terminalAssignment.receiptFormat;

  const warehouseAssignment = await receiptFormatRepository.findAssignmentByWarehouse(warehouseId);
  if (warehouseAssignment) return warehouseAssignment.receiptFormat;

  const tenantAssignment = await receiptFormatRepository.findAssignmentByTenant(tenantId);
  if (tenantAssignment) return tenantAssignment.receiptFormat;

  return receiptFormatRepository.findDefault();
}

function toView(format: ReceiptFormatWithAssignments): ReceiptFormatView {
  return {
    id: format.id.toString(),
    name: format.name,
    paperWidth: format.paperWidth,
    schema: format.schema as unknown as ReceiptFormatSchemaJson,
    version: format.version,
    isDefault: format.isDefault,
    assignments: format.assignments.map((a) => ({
      scope: a.terminalId ? "TERMINAL" : a.warehouseId ? "WAREHOUSE" : "TENANT",
      tenantId: a.tenantId?.toString() ?? null,
      warehouseId: a.warehouseId?.toString() ?? null,
      terminalId: a.terminalId?.toString() ?? null,
    })),
    createdAt: format.createdAt.toISOString(),
    updatedAt: format.updatedAt.toISOString(),
  };
}
