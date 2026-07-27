import { Module } from "@nestjs/common";
import { CostsService } from "./costs.service";
import { CostsController } from "./costs.controller";

@Module({
  providers: [CostsService],
  controllers: [CostsController],
  exports: [CostsService],
})
export class CostsModule {}
