import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as crypto from "crypto";
import ms from "../../common/ms";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class RefreshTokenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private hash(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex");
  }

  private generateOpaqueToken(): string {
    return crypto.randomBytes(64).toString("hex");
  }

  async issue(userId: string): Promise<string> {
    const token = this.generateOpaqueToken();
    const ttl = this.config.get<string>("REFRESH_TOKEN_TTL") ?? "30d";
    const expiresAt = new Date(Date.now() + ms(ttl));
    await this.prisma.refreshToken.create({
      data: { userId, tokenHash: this.hash(token), expiresAt },
    });
    return token;
  }

  /**
   * Rotates a refresh token: verifies it, revokes it, issues a new one.
   * Reuse of an already-revoked token revokes the whole family for that user.
   */
  async rotate(presentedToken: string): Promise<{ userId: string; newToken: string }> {
    const tokenHash = this.hash(presentedToken);
    const record = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });

    if (!record) {
      throw new UnauthorizedException({ code: "INVALID_REFRESH_TOKEN", message: "Invalid refresh token" });
    }

    if (record.revokedAt) {
      // Reuse of a revoked token: revoke the whole family, force re-login.
      await this.prisma.refreshToken.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException({
        code: "REFRESH_TOKEN_REUSED",
        message: "Refresh token reuse detected; all sessions revoked",
      });
    }

    if (record.expiresAt < new Date()) {
      throw new UnauthorizedException({ code: "REFRESH_TOKEN_EXPIRED", message: "Refresh token expired" });
    }

    await this.prisma.refreshToken.update({ where: { id: record.id }, data: { revokedAt: new Date() } });
    const newToken = await this.issue(record.userId);
    return { userId: record.userId, newToken };
  }

  async revoke(presentedToken: string): Promise<void> {
    const tokenHash = this.hash(presentedToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
