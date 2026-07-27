# Documentation

The README is the 30-second version. This is the rest.

| Document | What it covers |
| --- | --- |
| [architecture.md](architecture.md) | Module boundaries, request path, data model, why the code is shaped this way |
| [business-rules.md](business-rules.md) | The rules the product enforces, with the exact predicates and formulas |
| [costs.md](costs.md) | Operating costs: model, monthly rules, and the (unbuilt) ingestion design |
| [costs-handoff.md](costs-handoff.md) | Live status of the costs module — read this before working on it |
| [automations.md](automations.md) | Webhook contract, payloads, signature verification, run recording |
| [deployment.md](deployment.md) | Environment variables, migrations, health checks, rollback |
| [security.md](security.md) | Threat model and the isolation mechanism in detail |
| [adr/](adr/) | Architecture decision records — what was chosen, what was rejected, and when to revisit |

`../SECURITY.md` is the reporting policy and the public summary of controls;
`security.md` here is the engineering detail behind it.

[PROJECT_PLAN.md](../PROJECT_PLAN.md) is kept as a historical document: it is the
plan the system was built from, not a description of what it is now. Where the
two disagree, these documents are correct.
