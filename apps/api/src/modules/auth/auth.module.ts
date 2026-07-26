import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";
import { RefreshTokenService } from "./refresh-token.service";

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>("JWT_ACCESS_SECRET"),
        signOptions: { expiresIn: config.get<string>("ACCESS_TOKEN_TTL") },
      }),
    }),
  ],
  providers: [AuthService, RefreshTokenService],
  controllers: [AuthController],
  exports: [JwtModule, AuthService],
})
export class AuthModule {}
