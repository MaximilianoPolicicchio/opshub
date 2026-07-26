import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class NotesService {
  constructor(private readonly prisma: PrismaService) {}

  async listForProject(projectId: string, workspaceId: string, taskId?: string) {
    return this.prisma.note.findMany({
      where: { projectId, workspaceId, ...(taskId ? { taskId } : {}) },
      orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
    });
  }

  async create(
    projectId: string,
    workspaceId: string,
    authorId: string,
    input: { taskId?: string | null; title?: string | null; body: string; pinned?: boolean },
  ) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, workspaceId } });
    if (!project) throw new NotFoundException({ code: "NOT_FOUND", message: "Project not found" });
    return this.prisma.note.create({
      data: {
        workspaceId,
        projectId,
        taskId: input.taskId ?? null,
        authorId,
        title: input.title ?? null,
        body: input.body,
        pinned: input.pinned ?? false,
      },
    });
  }

  async update(id: string, workspaceId: string, input: { title?: string | null; body?: string; pinned?: boolean }) {
    const existing = await this.prisma.note.findFirst({ where: { id, workspaceId } });
    if (!existing) throw new NotFoundException({ code: "NOT_FOUND", message: "Note not found" });
    return this.prisma.note.update({
      where: { id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.body !== undefined ? { body: input.body } : {}),
        ...(input.pinned !== undefined ? { pinned: input.pinned } : {}),
      },
    });
  }

  async remove(id: string, workspaceId: string) {
    const existing = await this.prisma.note.findFirst({ where: { id, workspaceId } });
    if (!existing) throw new NotFoundException({ code: "NOT_FOUND", message: "Note not found" });
    await this.prisma.note.delete({ where: { id } });
  }
}
