# ADR-002: Migrate to CockroachDB

Date: 2026-09-20
Status: Reassessment pending (see postmortem-2025-06)

## Decision

We plan to migrate the memory core storage from PostgreSQL to CockroachDB.
ADR-002 supersedes ADR-001.

## Context

Initial load tests showed write contention on the claims table with 50+
concurrent agents. CockroachDB promises horizontal write scaling without
manual sharding.

## Rationale

- PostgreSQL write throughput saturated at ~4k writes/s in our benchmark.
- CockroachDB benchmark reached ~11k writes/s on the same schema.
- The migration risk is acceptable because both systems speak SQL.

## Consequences

- Storage layer must remain behind repository ports (no raw SQL in core).
- Multi-region deployment becomes possible after migration.
