import { Module } from "@nestjs/common";
import { InspireShowcaseController } from "./inspire-showcase.controller";
import { InspireShowcaseService } from "./inspire-showcase.service";

@Module({
  controllers: [InspireShowcaseController],
  providers: [InspireShowcaseService],
})
export class InspireShowcaseModule {}
