import { Body, Controller, Get, Patch, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import {
  registerSchema,
  loginSchema,
  refreshSchema,
  logoutSchema,
  updateProfileSchema,
  changePasswordSchema,
  type RegisterInput,
  type LoginInput,
  type RefreshInput,
  type LogoutInput,
  type UpdateProfileInput,
  type ChangePasswordInput,
} from "@opshub/contracts";
import { Public, CurrentUser } from "../../common/decorators";
import { RequestUser } from "../../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { AuthService } from "./auth.service";

/**
 * Every route validates its body with a shared Zod schema. Before this, the
 * handlers annotated `@Body()` with inline TypeScript types, which are erased
 * at compile time — the endpoints accepted any JSON at all, including a missing
 * password or an object where a string was expected.
 *
 * Rate limits are per-endpoint because the endpoints have different abuse
 * profiles: login is credential stuffing, register is account-spam, refresh is
 * token brute force, and change-password is an authenticated privilege change.
 */
@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  // Account creation is expensive (bcrypt + workspace + template tasks) and
  // unauthenticated, so it is the cheapest endpoint to abuse.
  @Throttle({ default: { limit: 5, ttl: 3_600_000 } })
  @Post("register")
  register(@Body(new ZodValidationPipe(registerSchema)) body: RegisterInput) {
    return this.auth.register(body);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 900_000 } })
  @Post("login")
  login(@Body(new ZodValidationPipe(loginSchema)) body: LoginInput) {
    return this.auth.login(body.email, body.password);
  }

  @Public()
  // Refresh tokens are 64 random bytes, so brute force is not the real risk;
  // this mainly bounds a client stuck in a refresh loop.
  @Throttle({ default: { limit: 30, ttl: 900_000 } })
  @Post("refresh")
  refresh(@Body(new ZodValidationPipe(refreshSchema)) body: RefreshInput) {
    return this.auth.refresh(body.refreshToken);
  }

  @Public()
  @Post("logout")
  logout(@Body(new ZodValidationPipe(logoutSchema)) body: LogoutInput) {
    return this.auth.logout(body.refreshToken);
  }

  @Get("me")
  me(@CurrentUser() user: RequestUser) {
    return this.auth.me(user.id);
  }

  @Patch("me")
  updateMe(@CurrentUser() user: RequestUser, @Body(new ZodValidationPipe(updateProfileSchema)) body: UpdateProfileInput) {
    return this.auth.updateMe(user.id, body);
  }

  // Guessing the current password is an online brute force against a known
  // account, so this is throttled harder than login.
  @Throttle({ default: { limit: 5, ttl: 3_600_000 } })
  @Post("change-password")
  changePassword(@CurrentUser() user: RequestUser, @Body(new ZodValidationPipe(changePasswordSchema)) body: ChangePasswordInput) {
    return this.auth.changePassword(user.id, body.currentPassword, body.newPassword);
  }
}
