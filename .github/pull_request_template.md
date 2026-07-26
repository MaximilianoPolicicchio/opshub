## What and why

<!-- What changes, and what problem it solves. The diff shows the what; use this
     space for the why. -->

## How it was verified

<!-- What you actually ran or observed, not what should work in theory. -->

- [ ] `pnpm build && pnpm -r typecheck && pnpm -r lint && pnpm test`
- [ ] API e2e (`pnpm --filter @opshub/api test:e2e`) — needs a database
- [ ] Browser e2e (`pnpm test:ui`) — needs a database
- [ ] Checked in a browser, if the change is visible

## Checklist

- [ ] Any write to a tenant-owned model filters by `workspaceId` in its own
      `where`, not only in a preceding check
- [ ] New business rules live in a dependency-free `*.logic.ts` with unit tests
- [ ] Money uses `Decimal`; durations are integer minutes
- [ ] No real customer, financial, or credential data added to seeds or fixtures
- [ ] README or `docs/` updated if behaviour or setup changed

## Anything left undone

<!-- Known gaps, follow-ups, or things you chose not to fix. Say so here rather
     than leaving them to be discovered. -->
