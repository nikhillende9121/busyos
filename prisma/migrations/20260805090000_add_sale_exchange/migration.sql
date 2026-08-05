-- CreateTable
CREATE TABLE `sale_exchanges` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `saleReturnId` BIGINT NOT NULL,
    `newSaleId` BIGINT NOT NULL,
    `differenceAmount` DECIMAL(14, 2) NOT NULL,
    `differenceDirection` ENUM('CUSTOMER_OWES', 'REFUND_DUE', 'EVEN') NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdBy` BIGINT NULL,

    UNIQUE INDEX `sale_exchanges_saleReturnId_key`(`saleReturnId`),
    UNIQUE INDEX `sale_exchanges_newSaleId_key`(`newSaleId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `sale_exchanges` ADD CONSTRAINT `sale_exchanges_saleReturnId_fkey` FOREIGN KEY (`saleReturnId`) REFERENCES `sale_returns`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sale_exchanges` ADD CONSTRAINT `sale_exchanges_newSaleId_fkey` FOREIGN KEY (`newSaleId`) REFERENCES `sales`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
