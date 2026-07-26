import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import * as crypto from "crypto";
import { PrismaService } from "../../prisma/prisma.service";
import { RefreshTokenService } from "./refresh-token.service";

const COMMON_PASSWORDS = new Set([
  "password123",
  "12345678910",
  "qwertyuiop1",
  "password1234",
  "letmein12345",
]);

const BCRYPT_COST = 12;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly refreshTokens: RefreshTokenService,
  ) {}

  private assertPasswordStrength(password: string) {
    if (password.length < 10) {
      throw new BadRequestException({ code: "WEAK_PASSWORD", message: "Password must be at least 10 characters" });
    }
    if (COMMON_PASSWORDS.has(password.toLowerCase())) {
      throw new BadRequestException({ code: "WEAK_PASSWORD", message: "This password is too common" });
    }
  }

  private async issueAccessToken(userId: string, email: string, wsIds: string[]) {
    return this.jwtService.signAsync(
      { sub: userId, email, wsIds, jti: crypto.randomUUID() },
      { secret: this.config.get<string>("JWT_ACCESS_SECRET"), expiresIn: this.config.get<string>("ACCESS_TOKEN_TTL") },
    );
  }

  async register(input: { email: string; password: string; name: string; workspaceName: string }) {
    this.assertPasswordStrength(input.password);

    const existing = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existing) throw new ConflictException({ code: "EMAIL_TAKEN", message: "Email is already registered" });

    const ownerRole = await this.prisma.role.findUnique({ where: { name: "OWNER" } });
    if (!ownerRole) {
      throw new BadRequestException({ code: "ROLES_NOT_SEEDED", message: "Roles have not been seeded yet" });
    }

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);
    const slug = this.slugify(input.workspaceName);

    const { user, workspace } = await this.prisma.$transaction(async (tx) => {
      const workspace = await tx.workspace.create({
        data: { name: input.workspaceName, slug: await this.uniqueSlug(tx, slug) },
      });
      const user = await tx.user.create({
        data: { email: input.email, passwordHash, name: input.name },
      });
      await tx.membership.create({
        data: { workspaceId: workspace.id, userId: user.id, roleId: ownerRole.id, acceptedAt: new Date() },
      });
      return { user, workspace };
    });

    const accessToken = await this.issueAccessToken(user.id, user.email, [workspace.id]);
    const refreshToken = await this.refreshTokens.issue(user.id);

    return { user: this.sanitizeUser(user), workspace, accessToken, refreshToken };
  }

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw new UnauthorizedException({ code: "INVALID_CREDENTIALS", message: "Invalid email or password" });

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new UnauthorizedException({ code: "INVALID_CREDENTIALS", message: "Invalid email or password" });

    const memberships = await this.prisma.membership.findMany({
      where: { userId: user.id },
      include: { workspace: true, role: true },
    });

    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    const accessToken = await this.issueAccessToken(
      user.id,
      user.email,
      memberships.map((m) => m.workspaceId),
    );
    const refreshToken = await this.refreshTokens.issue(user.id);

    return { user: this.sanitizeUser(user), memberships, accessToken, refreshToken };
  }

  async refresh(presentedToken: string) {
    const { userId, newToken } = await this.refreshTokens.rotate(presentedToken);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException({ code: "INVALID_REFRESH_TOKEN", message: "User not found" });
    const memberships = await this.prisma.membership.findMany({ where: { userId } });
    const accessToken = await this.issueAccessToken(
      user.id,
      user.email,
      memberships.map((m) => m.workspaceId),
    );
    return { accessToken, refreshToken: newToken };
  }

  async logout(presentedToken: string) {
    await this.refreshTokens.revoke(presentedToken);
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException({ code: "INVALID_TOKEN", message: "User not found" });
    const memberships = await this.prisma.membership.findMany({
      where: { userId },
      include: { workspace: true, role: true },
    });
    const runningTimer = await this.prisma.timeEntry.findFirst({ where: { userId, endTime: null } });
    return { user: this.sanitizeUser(user), memberships, runningTimer };
  }

  async updateMe(userId: string, input: { name?: string; timezone?: string }) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
      },
    });
    return this.sanitizeUser(user);
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException({ code: "INVALID_TOKEN", message: "User not found" });

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) throw new BadRequestException({ code: "INVALID_CREDENTIALS", message: "Current password is incorrect" });

    this.assertPasswordStrength(newPassword);
    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
    await this.refreshTokens.revokeAllForUser(userId);
  }

  private sanitizeUser(user: { id: string; email: string; name: string; timezone: string; lastLoginAt: Date | null }) {
    return { id: user.id, email: user.email, name: user.name, timezone: user.timezone, lastLoginAt: user.lastLoginAt };
  }

  private slugify(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "workspace";
  }

  private async uniqueSlug(tx: any, base: string): Promise<string> {
    let candidate = base;
    let i = 1;
    while (await tx.workspace.findUnique({ where: { slug: candidate } })) {
      candidate = `${base}-${i++}`;
    }
    return candidate;
  }
}
