-- AlterTable
ALTER TABLE `sales` ADD COLUMN `assignedDeliveryUserId` BIGINT NULL;

-- CreateIndex
CREATE INDEX `sales_assignedDeliveryUserId_idx` ON `sales`(`assignedDeliveryUserId`);

-- AddForeignKey
ALTER TABLE `sales` ADD CONSTRAINT `sales_assignedDeliveryUserId_fkey` FOREIGN KEY (`assignedDeliveryUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
