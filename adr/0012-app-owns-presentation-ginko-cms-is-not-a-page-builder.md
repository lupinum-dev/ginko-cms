# ADR 0012: App Owns Presentation, Ginko CMS Is Not A Page Builder

Status: Accepted

## Context

Ginko CMS is for Nuxt-built websites. Its job is to manage structured content,
routes, SEO, assets, translations, and public read models, not to own frontend
layout composition.

## Decision

The host app owns presentation. Ginko CMS is not a visual page builder.

## Consequences

Ginko CMS should provide content data, route facts, SEO metadata, navigation,
sitemap data, relation references, and asset references. The Nuxt app owns
layouts, components, styling, visual hierarchy, and interactions.
