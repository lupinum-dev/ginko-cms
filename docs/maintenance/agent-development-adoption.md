# Agent development adoption

Ginko CMS adopts the Lupinum agent-development workflow from handbook commit
`bace3d8d7f50fb6d5768a04e32c217ea6910b142` on branch
`codex/agent-development-rollout`.

This is app-owned evidence for development workflow adoption. It does not claim
production conformance with the handbook's environment, privacy, backup,
observability, or release policies.

## Adopted here

- Work begins from an isolated, current worktree and preserves unrelated local
  state in the canonical checkout.
- The local Convex deployment, secrets, accounts, content, and delivery inbox
  belong to that worktree. Trials use synthetic data and loopback endpoints.
- Better Convex is the checked authority runner for Convex commands.
- Candidate packages are built from a clean commit, hashed, installed in clean
  pnpm and npm consumers, and handed off by immutable path and source commit.
- Browser evidence covers the authenticated Studio journey as well as automated
  unit, contract, package, type, lint, format, and audit checks.

## Release boundary

The Better Convex `1.0.0-beta.5` generated auth schema includes
`user.bcnSecurityGeneration` and `session.bcnAssuranceGeneration`. Fresh local
component proof is valid, but a populated beta-3 auth component must not be
reset or upgraded until the operator proves that no depended-on auth rows exist
or a separate identity-preserving migration is reviewed, tested, and given a
rollback plan. CMS memberships depend on stable auth user IDs.

Production target mapping and release approvals remain operator-owned. This
rollout prepares evidence and candidates only; it does not publish packages,
deploy production, change DNS, or write production data.
