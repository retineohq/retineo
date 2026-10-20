# ADR-001: PostgreSQL as primary database

Date: 2026-09-01
Status: Superseded by ADR-002

## Decision

We chose PostgreSQL as the primary database for Retineo Memory Core.

## Context

The memory core needs durable, structured storage for objects, claims and
relationships. We evaluated SQLite, PostgreSQL and MongoDB.

## Rationale

- SQLite is simple and local-first, but limits concurrent writers.
- PostgreSQL provides mature JSONB support, strong consistency and horizontal
  read scaling, which matters for a shared memory service.
- MongoDB offered flexible schemas but weaker guarantees for relational
  queries that our claims model requires.

## Consequences

- Claims and relationships are stored in relational tables.
- Multi-tenant isolation relies on tenant_id columns and row-level checks.
