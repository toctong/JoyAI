import { Global, Module } from "@nestjs/common";
import { RolesGuard } from "./guards";

@Global()
@Module({
  providers: [RolesGuard],
  exports: [RolesGuard],
})
export class CommonModule {}
