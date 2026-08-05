-- AlterTable: stock_transfer_items
-- Rename quantity -> requestedQuantity via CHANGE COLUMN (preserves the 8
-- existing rows' values, unlike a drop+add), and add the three per-stage
-- quantity columns (null until that stage happens).
ALTER TABLE `stock_transfer_items`
  CHANGE COLUMN `quantity` `requestedQuantity` DECIMAL(18, 4) NOT NULL,
  ADD COLUMN `approvedQuantity` DECIMAL(18, 4) NULL,
  ADD COLUMN `shippedQuantity` DECIMAL(18, 4) NULL,
  ADD COLUMN `receivedQuantity` DECIMAL(18, 4) NULL;

-- AlterTable: stock_transfers
-- fromWarehouseId becomes nullable (unset until approve()); status enum
-- gains APPROVED; updatedAt is added nullable, backfilled from the
-- existing createdAt for the 7 existing rows, then locked NOT NULL.
ALTER TABLE `stock_transfers`
  MODIFY COLUMN `fromWarehouseId` BIGINT NULL,
  MODIFY COLUMN `status` ENUM('DRAFT', 'APPROVED', 'IN_TRANSIT', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN `updatedAt` DATETIME(3) NULL;

UPDATE `stock_transfers` SET `updatedAt` = `createdAt` WHERE `updatedAt` IS NULL;

ALTER TABLE `stock_transfers`
  MODIFY COLUMN `updatedAt` DATETIME(3) NOT NULL;
