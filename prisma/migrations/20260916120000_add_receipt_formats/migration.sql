-- CreateTable
CREATE TABLE `receipt_formats` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(150) NOT NULL,
    `paperWidth` INTEGER NOT NULL DEFAULT 58,
    `schema` JSON NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `isDefault` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdBy` BIGINT NULL,
    `deletedAt` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `receipt_format_assignments` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `receiptFormatId` BIGINT NOT NULL,
    `tenantId` BIGINT NULL,
    `warehouseId` BIGINT NULL,
    `terminalId` BIGINT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `receipt_format_assignments_tenantId_key`(`tenantId`),
    UNIQUE INDEX `receipt_format_assignments_warehouseId_key`(`warehouseId`),
    UNIQUE INDEX `receipt_format_assignments_terminalId_key`(`terminalId`),
    INDEX `receipt_format_assignments_receiptFormatId_idx`(`receiptFormatId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `receipt_format_assignments` ADD CONSTRAINT `receipt_format_assignments_receiptFormatId_fkey` FOREIGN KEY (`receiptFormatId`) REFERENCES `receipt_formats`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `receipt_format_assignments` ADD CONSTRAINT `receipt_format_assignments_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `receipt_format_assignments` ADD CONSTRAINT `receipt_format_assignments_warehouseId_fkey` FOREIGN KEY (`warehouseId`) REFERENCES `warehouses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `receipt_format_assignments` ADD CONSTRAINT `receipt_format_assignments_terminalId_fkey` FOREIGN KEY (`terminalId`) REFERENCES `terminals`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
