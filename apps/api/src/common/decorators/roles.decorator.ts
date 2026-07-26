import { SetMetadata } from "@nestjs/common";
import { RoleName } from "@opshub/contracts";

export const ROLES_KEY = "roles";
export const Roles = (...roles: RoleName[]) => SetMetadata(ROLES_KEY, roles);

export const PERMISSION_KEY = "permission";
export const RequirePermission = (permission: string) => SetMetadata(PERMISSION_KEY, permission);
