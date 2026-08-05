-- AlterTable
ALTER TABLE `customers` ADD COLUMN `state` VARCHAR(50) NULL;

-- AlterTable
ALTER TABLE `products` ADD COLUMN `taxRateId` BIGINT NULL;

-- AlterTable
ALTER TABLE `tenant_settings` ADD COLUMN `defaultTaxRateId` BIGINT NULL,
    ADD COLUMN `homeState` VARCHAR(50) NULL,
    ADD COLUMN `taxInclusivePricing` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `warehouses` ADD COLUMN `state` VARCHAR(50) NULL;

-- CreateTable
CREATE TABLE `tax_rates` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `tenantId` BIGINT NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `hsnCode` VARCHAR(20) NULL,
    `sacCode` VARCHAR(20) NULL,
    `ratePercent` DECIMAL(5, 2) NOT NULL,
    `cessPercent` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdBy` BIGINT NULL,
    `updatedBy` BIGINT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `tax_rates_tenantId_idx`(`tenantId`),
    INDEX `tax_rates_isActive_idx`(`isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `extra_charges` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `tenantId` BIGINT NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `calcType` ENUM('FLAT', 'PERCENTAGE') NOT NULL,
    `value` DECIMAL(14, 2) NOT NULL,
    `isTaxable` BOOLEAN NOT NULL DEFAULT false,
    `taxRateId` BIGINT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdBy` BIGINT NULL,
    `updatedBy` BIGINT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `extra_charges_tenantId_idx`(`tenantId`),
    INDEX `extra_charges_isActive_idx`(`isActive`),
    INDEX `extra_charges_taxRateId_idx`(`taxRateId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `purchase_item_taxes` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `purchaseItemId` BIGINT NOT NULL,
    `taxRateId` BIGINT NULL,
    `component` ENUM('CGST', 'SGST', 'IGST', 'CESS') NOT NULL,
    `ratePercent` DECIMAL(5, 2) NOT NULL,
    `amount` DECIMAL(14, 2) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `purchase_item_taxes_purchaseItemId_idx`(`purchaseItemId`),
    INDEX `purchase_item_taxes_taxRateId_idx`(`taxRateId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `purchase_charges` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `purchaseId` BIGINT NOT NULL,
    `extraChargeId` BIGINT NULL,
    `taxRateId` BIGINT NULL,
    `name` VARCHAR(100) NOT NULL,
    `amount` DECIMAL(14, 2) NOT NULL,
    `taxAmount` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `purchase_charges_purchaseId_idx`(`purchaseId`),
    INDEX `purchase_charges_extraChargeId_idx`(`extraChargeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sale_item_taxes` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `saleItemId` BIGINT NOT NULL,
    `taxRateId` BIGINT NULL,
    `component` ENUM('CGST', 'SGST', 'IGST', 'CESS') NOT NULL,
    `ratePercent` DECIMAL(5, 2) NOT NULL,
    `amount` DECIMAL(14, 2) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `sale_item_taxes_saleItemId_idx`(`saleItemId`),
    INDEX `sale_item_taxes_taxRateId_idx`(`taxRateId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sale_charges` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `saleId` BIGINT NOT NULL,
    `extraChargeId` BIGINT NULL,
    `taxRateId` BIGINT NULL,
    `name` VARCHAR(100) NOT NULL,
    `amount` DECIMAL(14, 2) NOT NULL,
    `taxAmount` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `sale_charges_saleId_idx`(`saleId`),
    INDEX `sale_charges_extraChargeId_idx`(`extraChargeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `products_taxRateId_idx` ON `products`(`taxRateId`);

-- CreateIndex
CREATE INDEX `tenant_settings_defaultTaxRateId_idx` ON `tenant_settings`(`defaultTaxRateId`);

-- AddForeignKey
ALTER TABLE `tenant_settings` ADD CONSTRAINT `tenant_settings_defaultTaxRateId_fkey` FOREIGN KEY (`defaultTaxRateId`) REFERENCES `tax_rates`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `products` ADD CONSTRAINT `products_taxRateId_fkey` FOREIGN KEY (`taxRateId`) REFERENCES `tax_rates`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tax_rates` ADD CONSTRAINT `tax_rates_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `extra_charges` ADD CONSTRAINT `extra_charges_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `extra_charges` ADD CONSTRAINT `extra_charges_taxRateId_fkey` FOREIGN KEY (`taxRateId`) REFERENCES `tax_rates`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_item_taxes` ADD CONSTRAINT `purchase_item_taxes_purchaseItemId_fkey` FOREIGN KEY (`purchaseItemId`) REFERENCES `purchase_items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_item_taxes` ADD CONSTRAINT `purchase_item_taxes_taxRateId_fkey` FOREIGN KEY (`taxRateId`) REFERENCES `tax_rates`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_charges` ADD CONSTRAINT `purchase_charges_purchaseId_fkey` FOREIGN KEY (`purchaseId`) REFERENCES `purchases`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_charges` ADD CONSTRAINT `purchase_charges_extraChargeId_fkey` FOREIGN KEY (`extraChargeId`) REFERENCES `extra_charges`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_charges` ADD CONSTRAINT `purchase_charges_taxRateId_fkey` FOREIGN KEY (`taxRateId`) REFERENCES `tax_rates`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sale_item_taxes` ADD CONSTRAINT `sale_item_taxes_saleItemId_fkey` FOREIGN KEY (`saleItemId`) REFERENCES `sale_items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sale_item_taxes` ADD CONSTRAINT `sale_item_taxes_taxRateId_fkey` FOREIGN KEY (`taxRateId`) REFERENCES `tax_rates`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sale_charges` ADD CONSTRAINT `sale_charges_saleId_fkey` FOREIGN KEY (`saleId`) REFERENCES `sales`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sale_charges` ADD CONSTRAINT `sale_charges_extraChargeId_fkey` FOREIGN KEY (`extraChargeId`) REFERENCES `extra_charges`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sale_charges` ADD CONSTRAINT `sale_charges_taxRateId_fkey` FOREIGN KEY (`taxRateId`) REFERENCES `tax_rates`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
