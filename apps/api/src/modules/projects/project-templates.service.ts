import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

export interface StarterTaskDef {
  title: string;
  category: string;
  priority: string;
  status?: string;
  offsetDays?: number;
  estimatedHours?: number;
}

@Injectable()
export class ProjectTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(workspaceId: string) {
    return this.prisma.projectTemplate.findMany({
      where: { OR: [{ workspaceId: null }, { workspaceId }] },
      orderBy: { createdAt: "asc" },
    });
  }

  async findByKey(key: string, workspaceId: string) {
    return this.prisma.projectTemplate.findFirst({
      where: { key, OR: [{ workspaceId: null }, { workspaceId }] },
    });
  }
}
