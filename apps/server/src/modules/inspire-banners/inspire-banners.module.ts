import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { InspireBanner } from "../../database/entities/inspire-banner.entity";
import { InspireBannersService } from "./inspire-banners.service";
import { InspireBannersController } from "./inspire-banners.controller";

@Module({
  imports: [TypeOrmModule.forFeature([InspireBanner])],
  controllers: [InspireBannersController],
  providers: [InspireBannersService],
  exports: [InspireBannersService],
})
export class InspireBannersModule {}
