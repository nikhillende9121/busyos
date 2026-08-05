-- AlterTable
ALTER TABLE `users` ADD COLUMN `warehouseId` BIGINT NULL;

-- CreateIndex
CREATE INDEX `users_warehouseId_idx` ON `users`(`warehouseId`);

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_warehouseId_fkey` FOREIGN KEY (`warehouseId`) REFERENCES `warehouses`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
