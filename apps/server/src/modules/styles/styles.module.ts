import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { StyleTemplate } from "../../database/entities/style-template.entity";
import { StylesService } from "./styles.service";
import { StylesController } from "./styles.controller";

@Module({
  imports: [TypeOrmModule.forFeature([StyleTemplate])],
  controllers: [StylesController],
  providers: [StylesService],
  exports: [StylesService],
})
export class StylesModule {}
