-- AlterTable: add as nullable first since the table isn't empty (one row
-- exists from earlier manual testing), backfill it, then enforce NOT NULL.
ALTER TABLE `sale_return_items` ADD COLUMN `refundAmount` DECIMAL(14, 2) NULL;

-- Backfill: this tenant's only existing return (4 units @ price 80, on a
-- sale created before the pricing engine existed, so no discount to prorate).
UPDATE `sale_return_items` SET `refundAmount` = 320.00 WHERE `refundAmount` IS NULL;

ALTER TABLE `sale_return_items` MODIFY COLUMN `refundAmount` DECIMAL(14, 2) NOT NULL;
