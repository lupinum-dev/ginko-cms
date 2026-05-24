# Product

## Register

product

## Users

Ginko CMS serves two primary groups working on Ginko-powered Nuxt websites:

- Nuxt/Ginko developers who define content models in code, own website presentation, configure integrations, and need operational confidence around publishing, imports, assets, MCP, and public output.
- Editors and content operators who manage structured website content, translations, drafts, assets, publish readiness, and activity without needing to understand Convex internals or schema implementation.

Users are usually in focused production work: continuing drafts, resolving blockers, checking localization readiness, publishing website changes, validating public output, and investigating operational failures.

## Product Purpose

Ginko CMS is a focused, self-hosted CMS Studio for structured Ginko/Nuxt websites. It sits between file/Git content workflows and broad CMS/data platforms: more editorially usable than Git-first workflows, narrower and more website-shaped than Directus-style general admin tools.

Success means editors can answer what needs attention, what changed, what can safely publish, and why something is or is not public. Developers can inspect diagnostics and content-model contracts without those implementation details dominating the editor experience.

## Brand Personality

Calm, precise, editorially confident.

The interface should feel like a reliable content operations cockpit: dense enough for repeated professional use, restrained enough to avoid distraction, and explicit enough that publish and destructive decisions feel accountable.

## Anti-references

- Generic database admin UIs where content reads like rows first and website impact second.
- Visual page builders, schema builders, and low-code internal-tool surfaces.
- Decorative SaaS dashboards with oversized metric cards, marketing hero sections, gradient-heavy composition, or repeated icon-card grids.
- Developer-first screens that expose contracts, projections, cache tags, and event ids as primary language for editors.
- Overly minimal empty states that hide the next action.

## Design Principles

1. Work queue first: every major screen should expose the next editorial action before implementation detail.
2. Website-facing language first: use content model, public output, website changes, affected pages, readiness, translations, and publish confidence in primary UI.
3. Diagnostics are present but secondary: developers can inspect cache tags, projection ids, events, and raw identifiers through explicit diagnostics areas.
4. Dense, not cramped: repeated workflows should be fast to scan, with stable columns, consistent controls, and clear hierarchy.
5. Publishing must feel accountable: readiness, affected locales, affected pages, revalidation, and destructive impact should be visible before confirmation.

## Accessibility & Inclusion

Target WCAG AA. The Studio should support keyboard-first operation, visible focus states, reduced-motion-safe interaction, readable status labels that do not rely on color alone, sufficient contrast in light and dark themes, and layouts that remain usable on tablet/mobile widths.
