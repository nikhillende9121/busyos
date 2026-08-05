-- AlterTable
ALTER TABLE `purchase_items` ADD COLUMN `returnedQuantity` DECIMAL(18, 4) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `sale_items` ADD COLUMN `returnedQuantity` DECIMAL(18, 4) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE `purchase_return_items` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `purchaseReturnId` BIGINT NOT NULL,
    `purchaseItemId` BIGINT NOT NULL,
    `quantity` DECIMAL(18, 4) NOT NULL,

    INDEX `purchase_return_items_purchaseReturnId_idx`(`purchaseReturnId`),
    INDEX `purchase_return_items_purchaseItemId_idx`(`purchaseItemId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sale_return_items` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `saleReturnId` BIGINT NOT NULL,
    `saleItemId` BIGINT NOT NULL,
    `quantity` DECIMAL(18, 4) NOT NULL,

    INDEX `sale_return_items_saleReturnId_idx`(`saleReturnId`),
    INDEX `sale_return_items_saleItemId_idx`(`saleItemId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `purchase_return_items` ADD CONSTRAINT `purchase_return_items_purchaseReturnId_fkey` FOREIGN KEY (`purchaseReturnId`) REFERENCES `purchase_returns`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_return_items` ADD CONSTRAINT `purchase_return_items_purchaseItemId_fkey` FOREIGN KEY (`purchaseItemId`) REFERENCES `purchase_items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sale_return_items` ADD CONSTRAINT `sale_return_items_saleReturnId_fkey` FOREIGN KEY (`saleReturnId`) REFERENCES `sale_returns`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sale_return_items` ADD CONSTRAINT `sale_return_items_saleItemId_fkey` FOREIGN KEY (`saleItemId`) REFERENCES `sale_items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
