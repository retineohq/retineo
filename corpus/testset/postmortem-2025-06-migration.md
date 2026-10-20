# Postmortem: Migration rehearsal failure

Date: 2026-10-08
Status: Final

## What happened

The first rehearsal of the CockroachDB migration failed because of a
configuration error (reserved keywords not quoted).

## Analysis

The failure contradicts one assumption of ADR-002: "the migration risk is
acceptable because both systems speak SQL". SQL compatibility turned out to
be insufficient; identifier quoting and tooling maturity matter.

## Decision

We decided to reassess ADR-002 before scheduling the production migration.
The reassessment must include a full rehearsal on production-sized data and
a rollback runbook.

## Action items

- Re-run the migration rehearsal with the patched tool.
- Add a rollback runbook before the next attempt.
- Update ADR-002 with revised risk assessment after the rehearsal.
