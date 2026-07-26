import { Body, Controller, Get, Patch, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Public, CurrentUser } from "../../common/decorators";
import { RequestUser } from "../../common/decorators/current-user.decorator";
import { AuthService } from "./auth.service";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post("register")
  register(@Body() body: { email: string; password: string; name: string; workspaceName: string }) {
    return this.auth.register(body);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 900_000 } })
  @Post("login")
  login(@Body() body: { email: string; password: string }) {
    return this.auth.login(body.email, body.password);
  }

  @Public()
  @Post("refresh")
  refresh(@Body("refreshToken") refreshToken: string) {
    return this.auth.refresh(refreshToken);
  }

  @Public()
  @Post("logout")
  logout(@Body("refreshToken") refreshToken: string) {
    return this.auth.logout(refreshToken);
  }

  @Get("me")
  me(@CurrentUser() user: RequestUser) {
    return this.auth.me(user.id);
  }

  @Patch("me")
  updateMe(@CurrentUser() user: RequestUser, @Body() body: { name?: string; timezone?: string }) {
    return this.auth.updateMe(user.id, body);
  }

  @Post("change-password")
  changePassword(@CurrentUser() user: RequestUser, @Body() body: { currentPassword: string; newPassword: string }) {
    return this.auth.changePassword(user.id, body.currentPassword, body.newPassword);
  }
}
