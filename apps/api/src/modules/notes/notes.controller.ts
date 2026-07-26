import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { WorkspaceId, CurrentUser } from "../../common/decorators";
import { RequestUser } from "../../common/decorators/current-user.decorator";
import { NotesService } from "./notes.service";

@Controller()
export class NotesController {
  constructor(private readonly notes: NotesService) {}

  @Get("projects/:projectId/notes")
  list(@WorkspaceId() workspaceId: string, @Param("projectId") projectId: string, @Query("taskId") taskId?: string) {
    return this.notes.listForProject(projectId, workspaceId, taskId);
  }

  @Post("projects/:projectId/notes")
  create(
    @WorkspaceId() workspaceId: string,
    @CurrentUser() user: RequestUser,
    @Param("projectId") projectId: string,
    @Body() body: any,
  ) {
    return this.notes.create(projectId, workspaceId, user.id, body);
  }

  @Patch("notes/:id")
  update(@WorkspaceId() workspaceId: string, @Param("id") id: string, @Body() body: any) {
    return this.notes.update(id, workspaceId, body);
  }

  @Delete("notes/:id")
  remove(@WorkspaceId() workspaceId: string, @Param("id") id: string) {
    return this.notes.remove(id, workspaceId);
  }
}
