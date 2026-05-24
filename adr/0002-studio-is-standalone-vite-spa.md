# ADR 0002: Studio Is A Standalone Vite SPA

Status: Accepted

## Context

Studio is an authenticated CMS application. It is not public site UI and should
not be scanned, SSR-rendered, or typechecked as if it were part of the host Nuxt
site.

## Decision

Keep Studio as a standalone Vite SPA hosted by the Nuxt module.

The Nuxt module owns the host route, auth pages, runtime bridge, public asset
serving, and required styling integration. The Studio app owns authenticated CMS
workflows.

## Consequences

Do not move Studio into a Nuxt layer. Host apps mount Studio, but do not own its
internal routing or bundle.
