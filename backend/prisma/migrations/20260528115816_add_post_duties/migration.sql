-- AlterTable
ALTER TABLE `post_duties` ADD COLUMN `vehicleId` INTEGER NULL;

-- CreateIndex
CREATE INDEX `post_duties_vehicleId_idx` ON `post_duties`(`vehicleId`);

-- AddForeignKey
ALTER TABLE `post_duties` ADD CONSTRAINT `post_duties_vehicleId_fkey` FOREIGN KEY (`vehicleId`) REFERENCES `vehicles`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
