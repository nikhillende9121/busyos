-- AlterTable
ALTER TABLE `products` ADD COLUMN `trackBatches` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `inventory_transactions` ADD COLUMN `productBatchId` BIGINT NULL;

-- AlterTable
ALTER TABLE `stock_adjustment_items` ADD COLUMN `productBatchId` BIGINT NULL;

-- AlterTable
ALTER TABLE `purchase_return_items` ADD COLUMN `productBatchId` BIGINT NULL;

-- CreateTable
CREATE TABLE `product_batches` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `tenantId` BIGINT NOT NULL,
    `warehouseId` BIGINT NOT NULL,
    `productId` BIGINT NOT NULL,
    `batchNumber` VARCHAR(100) NOT NULL,
    `expiryDate` DATETIME(3) NULL,
    `manufacturedDate` DATETIME(3) NULL,
    `costPrice` DECIMAL(14, 2) NULL,
    `quantity` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `product_batches_warehouseId_productId_batchNumber_key`(`warehouseId`, `productId`, `batchNumber`),
    INDEX `product_batches_tenantId_idx`(`tenantId`),
    INDEX `product_batches_productId_expiryDate_idx`(`productId`, `expiryDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sale_item_batches` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `saleItemId` BIGINT NOT NULL,
    `productBatchId` BIGINT NOT NULL,
    `quantity` DECIMAL(18, 4) NOT NULL,

    INDEX `sale_item_batches_saleItemId_idx`(`saleItemId`),
    INDEX `sale_item_batches_productBatchId_idx`(`productBatchId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `stock_transfer_item_batches` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `stockTransferItemId` BIGINT NOT NULL,
    `productBatchId` BIGINT NOT NULL,
    `quantity` DECIMAL(18, 4) NOT NULL,

    INDEX `stock_transfer_item_batches_stockTransferItemId_idx`(`stockTransferItemId`),
    INDEX `stock_transfer_item_batches_productBatchId_idx`(`productBatchId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `inventory_transactions_productBatchId_idx` ON `inventory_transactions`(`productBatchId`);

-- CreateIndex
CREATE INDEX `stock_adjustment_items_productBatchId_idx` ON `stock_adjustment_items`(`productBatchId`);

-- CreateIndex
CREATE INDEX `purchase_return_items_productBatchId_idx` ON `purchase_return_items`(`productBatchId`);

-- AddForeignKey
ALTER TABLE `product_batches` ADD CONSTRAINT `product_batches_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `product_batches` ADD CONSTRAINT `product_batches_warehouseId_fkey` FOREIGN KEY (`warehouseId`) REFERENCES `warehouses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `product_batches` ADD CONSTRAINT `product_batches_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `inventory_transactions` ADD CONSTRAINT `inventory_transactions_productBatchId_fkey` FOREIGN KEY (`productBatchId`) REFERENCES `product_batches`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `sale_item_batches` ADD CONSTRAINT `sale_item_batches_saleItemId_fkey` FOREIGN KEY (`saleItemId`) REFERENCES `sale_items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `sale_item_batches` ADD CONSTRAINT `sale_item_batches_productBatchId_fkey` FOREIGN KEY (`productBatchId`) REFERENCES `product_batches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `stock_transfer_item_batches` ADD CONSTRAINT `stock_transfer_item_batches_stockTransferItemId_fkey` FOREIGN KEY (`stockTransferItemId`) REFERENCES `stock_transfer_items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `stock_transfer_item_batches` ADD CONSTRAINT `stock_transfer_item_batches_productBatchId_fkey` FOREIGN KEY (`productBatchId`) REFERENCES `product_batches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `stock_adjustment_items` ADD CONSTRAINT `stock_adjustment_items_productBatchId_fkey` FOREIGN KEY (`productBatchId`) REFERENCES `product_batches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `purchase_return_items` ADD CONSTRAINT `purchase_return_items_productBatchId_fkey` FOREIGN KEY (`productBatchId`) REFERENCES `product_batches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
