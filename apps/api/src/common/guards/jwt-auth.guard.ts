import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";

export interface AccessTokenClaims {
  sub: string;
  email: string;
  wsIds: string[];
  jti: string;
  iat: number;
  exp: number;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const token = this.extractToken(request);
    if (!token) throw new UnauthorizedException({ code: "UNAUTHENTICATED", message: "Missing access token" });

    try {
      const claims = await this.jwtService.verifyAsync<AccessTokenClaims>(token, {
        secret: this.configService.get<string>("JWT_ACCESS_SECRET"),
      });
      request.user = { id: claims.sub, email: claims.email };
      request.tokenWsIds = claims.wsIds;
      return true;
    } catch {
      throw new UnauthorizedException({ code: "INVALID_TOKEN", message: "Invalid or expired access token" });
    }
  }

  private extractToken(request: any): string | undefined {
    const header: string | undefined = request.headers?.authorization;
    if (!header) return undefined;
    const [type, token] = header.split(" ");
    return type === "Bearer" ? token : undefined;
  }
}
