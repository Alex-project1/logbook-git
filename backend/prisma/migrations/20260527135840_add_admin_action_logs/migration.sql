-- CreateTable
CREATE TABLE `admin_action_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `adminUserId` INTEGER NULL,
    `adminLogin` VARCHAR(100) NULL,
    `adminName` VARCHAR(255) NULL,
    `action` VARCHAR(80) NOT NULL,
    `entityType` VARCHAR(80) NOT NULL,
    `entityId` INTEGER NULL,
    `cityId` INTEGER NULL,
    `description` VARCHAR(1000) NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `admin_action_logs_createdAt_idx`(`createdAt`),
    INDEX `admin_action_logs_action_idx`(`action`),
    INDEX `admin_action_logs_entityType_entityId_idx`(`entityType`, `entityId`),
    INDEX `admin_action_logs_cityId_idx`(`cityId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
