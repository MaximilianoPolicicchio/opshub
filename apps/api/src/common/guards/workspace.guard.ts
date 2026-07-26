import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PrismaService } from "../../prisma/prisma.service";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";

@Injectable()
export class WorkspaceGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const userId: string | undefined = request.user?.id;
    if (!userId) throw new ForbiddenException({ code: "NO_MEMBERSHIP", message: "Not authenticated" });

    // /auth/* endpoints (me, change-password, ...) are user-scoped, not
    // workspace-scoped; skip workspace resolution for anything under /auth.
    if (typeof request.originalUrl === "string" && /\/auth(\/|$)/.test(request.originalUrl)) return true;

    const workspaceId =
      request.headers["x-workspace-id"] ||
      request.params?.workspaceId ||
      (await this.resolveDefaultWorkspace(userId));

    if (!workspaceId) {
      throw new ForbiddenException({ code: "NO_MEMBERSHIP", message: "No workspace membership found" });
    }

    const membership = await this.prisma.membership.findFirst({
      where: { workspaceId, userId },
      include: { role: true },
    });

    if (!membership) {
      throw new ForbiddenException({ code: "NO_MEMBERSHIP", message: "Not a member of this workspace" });
    }

    request.workspaceId = workspaceId;
    request.role = membership.role.name;
    request.permissions = membership.role.permissions;
    request.membership = membership;
    return true;
  }

  private async resolveDefaultWorkspace(userId: string): Promise<string | undefined> {
    const membership = await this.prisma.membership.findFirst({ where: { userId } });
    return membership?.workspaceId;
  }
}
