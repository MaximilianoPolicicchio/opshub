import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { RoleName } from "@opshub/contracts";
import { ROLES_KEY, PERMISSION_KEY } from "../decorators/roles.decorator";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<RoleName[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const requiredPermission = this.reflector.getAllAndOverride<string>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles && !requiredPermission) return true;

    const request = context.switchToHttp().getRequest();
    const role: RoleName | undefined = request.role;
    const permissions: string[] = request.permissions ?? [];

    if (requiredRoles && requiredRoles.length > 0) {
      if (!role || !requiredRoles.includes(role)) {
        throw new ForbiddenException({ code: "FORBIDDEN_ROLE", message: "Insufficient role" });
      }
    }

    if (requiredPermission) {
      const has = permissions.includes("*") || permissions.includes(requiredPermission);
      if (!has) {
        throw new ForbiddenException({ code: "FORBIDDEN_PERMISSION", message: "Insufficient permissions" });
      }
    }

    return true;
  }
}
