import { Controller, Get } from "@nestjs/common";
import { Public } from "../../common/decorators";
import { PrismaService } from "../../prisma/prisma.service";

const VERSION = "0.1.0";

@Controller()
export class SystemController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get("health")
  async health() {
    let db: "up" | "down" = "down";
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      db = "up";
    } catch {
      db = "down";
    }
    return { status: db === "up" ? "ok" : "degraded", db, version: VERSION };
  }
}
