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

  /**
   * How long after rotation a spent token is still accepted as a benign retry
   * rather than treated as theft. Long enough to cover a page load racing an
   * in-flight refresh, short enough that it is not a useful attack window.
   */
  private reuseGraceMs(): number {
    const raw = this.config.get<string>("REFRESH_REUSE_GRACE_MS");
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 10_000;
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
      const revokedMsAgo = Date.now() - record.revokedAt.getTime();

      // A token presented moments after it was rotated is far more likely to be
      // a benign retry than theft. The browser is the common case: reload the
      // page while the boot refresh is still in flight and the new cookie never
      // lands, so the next page load presents the previous token. Treating that
      // as theft logged people out permanently for double-tapping reload.
      //
      // Within the grace window we issue a fresh token and leave the family
      // alone. An attacker would have to replay inside that window, which
      // requires already having intercepted a token that is legitimately being
      // used right now — at which point the window is not the weak link.
      // Outside it, reuse is still treated as theft.
      if (revokedMsAgo <= this.reuseGraceMs()) {
        const newToken = await this.issue(record.userId);
        return { userId: record.userId, newToken };
      }

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
