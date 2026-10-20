# Incident report: Migration test failure (2026-10-05)

Date: 2026-10-05
Status: Resolved

## Summary

The migration rehearsal from PostgreSQL to CockroachDB failed during the
schema conversion step. The rehearsal was caused by a bad configuration:
the migration tool applied CockroachDB reserved keywords as identifiers.

## Impact

- Rehearsal aborted after 20 minutes.
- No production data was affected; the incident happened in staging.
- The rollout of ADR-002 was postponed until a fix is verified.

## Root cause

The migration config file mapped PostgreSQL column `user` without quoting.
CockroachDB treats `user` as a reserved word, so schema conversion failed
on the first batch.

## Resolution

The migration tool was patched to auto-quote identifiers. ADR-002 remains
pending until the next successful rehearsal.
