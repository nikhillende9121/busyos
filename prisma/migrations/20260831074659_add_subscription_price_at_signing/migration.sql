-- AlterTable
ALTER TABLE `tenant_subscriptions` ADD COLUMN `priceAtSigning` DECIMAL(12,2) NULL;

-- Backfill existing rows from their plan's current price
UPDATE `tenant_subscriptions` ts
JOIN `plans` p ON ts.`planId` = p.`id`
SET ts.`priceAtSigning` = p.`price`
WHERE ts.`priceAtSigning` IS NULL;

-- AlterTable
ALTER TABLE `tenant_subscriptions` MODIFY COLUMN `priceAtSigning` DECIMAL(12,2) NOT NULL;
