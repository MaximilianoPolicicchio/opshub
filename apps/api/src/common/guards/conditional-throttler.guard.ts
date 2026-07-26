import { Injectable } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";

/**
 * Throttling with a switch.
 *
 * Rate limits are a production control, but they are hostile to an e2e suite:
 * the isolation specs register two fresh users per test, which trips the
 * register limit and turns real assertions into 429s. Disabling the limits for
 * those runs keeps the suite testing what it claims to test.
 *
 * The flag defaults to enabled, so forgetting to set it is safe — you get
 * throttling, not the absence of it. `throttling.e2e-spec.ts` turns it back on
 * to prove the limits actually fire.
 */
@Injectable()
export class ConditionalThrottlerGuard extends ThrottlerGuard {
  protected async shouldSkip(): Promise<boolean> {
    return process.env.THROTTLE_ENABLED === "false";
  }
}
