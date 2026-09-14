-- AlterTable
ALTER TABLE `tenant_settings` ADD COLUMN `defaultCreditLimit` DECIMAL(14, 2) NULL;

-- CreateTable
CREATE TABLE `customer_credits` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `tenantId` BIGINT NOT NULL,
    `customerId` BIGINT NOT NULL,
    `creditLimit` DECIMAL(14, 2) NULL,
    `settlementDay` INTEGER NULL,
    `currentBalance` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `customer_credits_customerId_key`(`customerId`),
    INDEX `customer_credits_tenantId_idx`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `credit_transactions` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `tenantId` BIGINT NOT NULL,
    `customerId` BIGINT NOT NULL,
    `type` ENUM('OPENING', 'SALE_CHARGE', 'PAYMENT', 'CREDIT_NOTE', 'ADJUSTMENT') NOT NULL,
    `direction` ENUM('IN', 'OUT') NOT NULL,
    `amount` DECIMAL(14, 2) NOT NULL,
    `runningBalance` DECIMAL(14, 2) NOT NULL,
    `paymentMethod` ENUM('CASH', 'CARD', 'BANK_TRANSFER', 'UPI', 'CHEQUE', 'CREDIT') NULL,
    `referenceType` ENUM('SALE', 'SALE_RETURN', 'MANUAL') NULL,
    `referenceId` BIGINT NULL,
    `remarks` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdBy` BIGINT NULL,

    INDEX `credit_transactions_tenantId_customerId_createdAt_idx`(`tenantId`, `customerId`, `createdAt`),
    INDEX `credit_transactions_referenceType_referenceId_idx`(`referenceType`, `referenceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `customer_credits` ADD CONSTRAINT `customer_credits_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `customer_credits` ADD CONSTRAINT `customer_credits_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `customers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `credit_transactions` ADD CONSTRAINT `credit_transactions_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `credit_transactions` ADD CONSTRAINT `credit_transactions_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `customers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
