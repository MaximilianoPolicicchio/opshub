import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { WorkspaceId } from "../../common/decorators";
import { WeeklyReviewService } from "./weekly-review.service";

@Controller("weekly-review")
export class WeeklyReviewController {
  constructor(private readonly weeklyReview: WeeklyReviewService) {}

  @Get()
  get(@WorkspaceId() workspaceId: string, @Query("weekStart") weekStart?: string) {
    return this.weeklyReview.get(workspaceId, weekStart);
  }

  @Post("generate")
  generate(@WorkspaceId() workspaceId: string, @Body("weekStart") weekStart?: string) {
    return this.weeklyReview.generate(workspaceId, weekStart);
  }
}
