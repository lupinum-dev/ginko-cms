# Better Convex vNext MCP App proof

Date: 2026-09-08

Status: superseded.

The former beta.15 browser-harness narrative no longer describes the active
package tuple or MCP Apps dependency. Git history preserves that proof.

Current source compatibility is bound to the exact Better Convex beta.5 commit in
[`packages/cms/compatibility.json`](../../packages/cms/compatibility.json) and
is verified by the ordinary CI source-rehearsal lane. Immutable Nuxt/Vue beta.5
and MCP beta.1 registry evidence is recorded there. MCP stays on its independent
beta.1 line; the Nuxt/Vue upgrade does not claim a new MCP release or broader
host interoperability proof.

This superseded record is not production auth-migration evidence. Beta.4's new
required user/session generation fields are certified only on a fresh component
until an identity-preserving populated-component migration is separately proven.
