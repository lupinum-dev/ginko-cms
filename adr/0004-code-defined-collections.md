# ADR 0004: Code-Defined Collections

Status: Accepted

## Context

CMS products often drift when schema can be changed in the UI while application
code assumes something else. Ginko CMS is meant for typed Nuxt sites where the
application owns the content model.

## Decision

Collections and schemas are defined in host app code. Ginko CMS syncs those
definitions into the CMS as read-only contracts.

Studio and MCP inspect and operate through the contracts. They do not create,
update, delete, import, reorder, or otherwise mutate collection/schema
definitions.

## Consequences

Schema changes are code changes. Studio should explain contract drift and stored
content issues, not silently rewrite the schema. Filesystem migration imports
content under existing contracts rather than inventing schema.
