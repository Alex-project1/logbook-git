-- CreateTable
CREATE TABLE `duty_posts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `cityId` INTEGER NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `comment` VARCHAR(1000) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `deletedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `duty_posts_cityId_idx`(`cityId`),
    INDEX `duty_posts_deletedAt_idx`(`deletedAt`),
    UNIQUE INDEX `duty_posts_cityId_name_key`(`cityId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `post_duties` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `cityId` INTEGER NOT NULL,
    `postId` INTEGER NOT NULL,
    `dutyDate` DATETIME(3) NOT NULL,
    `durationHours` DECIMAL(6, 2) NOT NULL,
    `note` VARCHAR(1000) NULL,
    `deletedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `post_duties_cityId_idx`(`cityId`),
    INDEX `post_duties_postId_idx`(`postId`),
    INDEX `post_duties_dutyDate_idx`(`dutyDate`),
    INDEX `post_duties_deletedAt_idx`(`deletedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `post_duty_members` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `postDutyId` INTEGER NOT NULL,
    `employeeId` INTEGER NOT NULL,
    `hasWeapon` BOOLEAN NOT NULL DEFAULT false,
    `isDriver` BOOLEAN NOT NULL DEFAULT false,
    `comment` VARCHAR(1000) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `post_duty_members_employeeId_idx`(`employeeId`),
    UNIQUE INDEX `post_duty_members_postDutyId_employeeId_key`(`postDutyId`, `employeeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `duty_posts` ADD CONSTRAINT `duty_posts_cityId_fkey` FOREIGN KEY (`cityId`) REFERENCES `cities`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `post_duties` ADD CONSTRAINT `post_duties_cityId_fkey` FOREIGN KEY (`cityId`) REFERENCES `cities`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `post_duties` ADD CONSTRAINT `post_duties_postId_fkey` FOREIGN KEY (`postId`) REFERENCES `duty_posts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `post_duty_members` ADD CONSTRAINT `post_duty_members_postDutyId_fkey` FOREIGN KEY (`postDutyId`) REFERENCES `post_duties`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `post_duty_members` ADD CONSTRAINT `post_duty_members_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
