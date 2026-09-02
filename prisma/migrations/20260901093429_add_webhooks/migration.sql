-- AlterTable
ALTER TABLE `plans` ADD COLUMN `maxWebhooks` INTEGER NULL;

-- AlterTable
ALTER TABLE `sales` ADD COLUMN `webhookIntegrationId` BIGINT NULL, ADD COLUMN `externalOrderReference` VARCHAR(150) NULL;

-- CreateTable
CREATE TABLE `tenant_webhook_integrations` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `tenantId` BIGINT NOT NULL,
    `apiKey` VARCHAR(64) NOT NULL,
    `apiSecretEncrypted` TEXT NOT NULL,
    `defaultOnlineWarehouseId` BIGINT NULL,
    `isEnabled` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `tenant_webhook_integrations_tenantId_key`(`tenantId`),
    UNIQUE INDEX `tenant_webhook_integrations_apiKey_key`(`apiKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `webhook_endpoints` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `tenantId` BIGINT NOT NULL,
    `integrationId` BIGINT NOT NULL,
    `url` VARCHAR(500) NOT NULL,
    `signingSecret` TEXT NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `webhook_endpoints_tenantId_idx`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `webhook_endpoint_event_types` (
    `webhookEndpointId` BIGINT NOT NULL,
    `eventType` ENUM('PRODUCT_CREATED', 'PRODUCT_UPDATED', 'PRODUCT_DELETED', 'PRICE_LIST_CREATED', 'PRICE_LIST_UPDATED', 'DISCOUNT_CREATED', 'DISCOUNT_UPDATED', 'DISCOUNT_DELETED', 'COUPON_CREATED', 'COUPON_UPDATED', 'COUPON_DELETED', 'INVENTORY_UPDATED') NOT NULL,

    PRIMARY KEY (`webhookEndpointId`, `eventType`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `webhook_deliveries` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `webhookEndpointId` BIGINT NOT NULL,
    `eventType` ENUM('PRODUCT_CREATED', 'PRODUCT_UPDATED', 'PRODUCT_DELETED', 'PRICE_LIST_CREATED', 'PRICE_LIST_UPDATED', 'DISCOUNT_CREATED', 'DISCOUNT_UPDATED', 'DISCOUNT_DELETED', 'COUPON_CREATED', 'COUPON_UPDATED', 'COUPON_DELETED', 'INVENTORY_UPDATED') NOT NULL,
    `payload` JSON NOT NULL,
    `status` ENUM('PENDING', 'SUCCESS', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `httpStatusCode` INTEGER NULL,
    `attemptCount` INTEGER NOT NULL DEFAULT 0,
    `lastAttemptedAt` DATETIME(3) NULL,
    `nextRetryAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `webhook_deliveries_webhookEndpointId_status_idx`(`webhookEndpointId`, `status`),
    INDEX `webhook_deliveries_nextRetryAt_idx`(`nextRetryAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `sales_webhookIntegrationId_externalOrderReference_idx` ON `sales`(`webhookIntegrationId`, `externalOrderReference`);

-- AddForeignKey
ALTER TABLE `tenant_webhook_integrations` ADD CONSTRAINT `tenant_webhook_integrations_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `tenant_webhook_integrations` ADD CONSTRAINT `tenant_webhook_integrations_defaultOnlineWarehouseId_fkey` FOREIGN KEY (`defaultOnlineWarehouseId`) REFERENCES `warehouses`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `webhook_endpoints` ADD CONSTRAINT `webhook_endpoints_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `webhook_endpoints` ADD CONSTRAINT `webhook_endpoints_integrationId_fkey` FOREIGN KEY (`integrationId`) REFERENCES `tenant_webhook_integrations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `webhook_endpoint_event_types` ADD CONSTRAINT `webhook_endpoint_event_types_webhookEndpointId_fkey` FOREIGN KEY (`webhookEndpointId`) REFERENCES `webhook_endpoints`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `webhook_deliveries` ADD CONSTRAINT `webhook_deliveries_webhookEndpointId_fkey` FOREIGN KEY (`webhookEndpointId`) REFERENCES `webhook_endpoints`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `sales` ADD CONSTRAINT `sales_webhookIntegrationId_fkey` FOREIGN KEY (`webhookIntegrationId`) REFERENCES `tenant_webhook_integrations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
