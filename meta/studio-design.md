# Ginko CMS Studio Design Reference

The Studio app is built on **shadcn-vue** primitives. There is no parallel design system, no custom palette, no Studio-specific tone tokens. Pages compose `components/ui/*` primitives directly, with thin `Studio*` wrappers for repeated CMS patterns.

## Tokens

All colors live in `packages/cms/studio-app/src/styles/index.css` as OKLCH custom properties exposed through Tailwind 4's `@theme inline`:

- Surface: `--background`, `--foreground`, `--card`, `--card-foreground`, `--popover`, `--popover-foreground`, `--muted`, `--muted-foreground`, `--accent`, `--accent-foreground`
- Brand / state: `--primary`, `--primary-foreground`, `--secondary`, `--secondary-foreground`, `--destructive`, `--destructive-foreground`, `--success`, `--success-foreground`, `--warning`, `--warning-foreground`
- Structure: `--border`, `--input`, `--ring`, `--radius` (+ derived `--radius-sm/md/lg/xl`)
- Sidebar: `--sidebar`, `--sidebar-foreground`, `--sidebar-primary`, `--sidebar-accent`, `--sidebar-border`, `--sidebar-ring`
- Charts: `--chart-1` through `--chart-5`
- Typography: `--font-body`, `--font-heading`, `--font-mono` (system stacks; no custom font dependencies)

Dark mode lives under `.dark` and overrides the same set. There are no `--studio-*` tokens. There is no Caveat or other distinctive Ginko font.

The `.ginko-cms` scope class on the root sets `color-scheme` so native form controls render correctly. The opt-in `.ginko-cms--sidebar-dark` class lets a host force a dark sidebar in light mode (for users who configure `cmsConfig.sidebar.dark`).

## Token rules

- Use Tailwind utility classes that map to canonical tokens: `bg-card`, `bg-muted`, `bg-muted/30`, `bg-success/10`, `border-warning/40`, `text-destructive`, etc.
- Use `color-mix(in oklch, var(--token) <pct>%, var(--background))` only when the utility tints aren't expressive enough. Prefer the utility classes.
- Never write hardcoded hex / rgb / hsl colors in components. The only exceptions in `src/` are decorative SVG flags inside `Icon.vue` and seed colors inside `composables/internal/useStudioAssetFinder.ts`.
- Never write `dark:bg-emerald-*` / `dark:text-amber-*` / etc. literal Tailwind palette colors. Use `success`, `warning`, `primary`, `destructive` semantic classes.
- Never reintroduce `--studio-*` tokens, `hsl(var(--...))` wrappers around OKLCH values, `!important`, or pure neutral black / white.

## Page shell

Every page mounts inside `<StudioWorkspace>`:

```vue
<StudioWorkspace class="h-full" :rail="hasInspector">
  <template #header>
    <StudioPageHeader title="Page title" eyebrow="Area" description="Optional summary.">
      <template #actions>
        <Button size="sm">Primary action</Button>
      </template>
    </StudioPageHeader>
  </template>
  <template #toolbar><!-- filters, search, segmented controls --></template>
  <ScrollArea class="flex-1">
    <div class="p-4 sm:p-5">…</div>
  </ScrollArea>
  <template #rail>
    <StudioInspectorSection title="Section">…</StudioInspectorSection>
  </template>
</StudioWorkspace>
```

Pages do NOT wrap their content in a top-level `Card`. The workspace is the page card. Use `StudioListFrame`, `StudioSection`, `Alert`, `StudioSegmentedControl`, or native tables inside.

## Studio wrappers (thin layers over shadcn primitives)

| Wrapper                       | Composes                                                                             | Use for                                                                             |
| ----------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `StudioWorkspace`             | layout primitives                                                                    | Page shell with optional inspector rail                                             |
| `StudioPageHeader`            | layout                                                                               | Standard page header with eyebrow / title / description / actions / breadcrumb slot |
| `StudioSection`               | `Card`-like layout + `Badge`                                                         | Bordered content section with header                                                |
| `StudioListFrame`             | layout + `Skeleton`, `Badge`                                                         | Bordered table or list frame (compact / comfortable density)                        |
| `StudioFieldShell`            | `Label`                                                                              | Form field shell (label, optional / required, description, error)                   |
| `StudioStatusPill`            | `Badge` (with `success` / `warning` / `destructive` / `secondary` / `soft` variants) | Inline status badge, single tone language                                           |
| `StudioNotice`                | `Alert`                                                                              | Inline page-level info / success / warning / danger / neutral notice                |
| `StudioSegmentedControl`      | `ToggleGroup`                                                                        | Compact view-mode switches (e.g. grid / list, raw / preview)                        |
| `StudioEmptyState`            | layout                                                                               | Empty / zero-state with icon, title, description, action                            |
| `StudioInspector` / `Section` | `Sheet` (mobile) / pinned rail (lg+)                                                 | Right-rail inspector with mobile sheet behavior                                     |

These wrappers are the only Studio-specific abstractions. Everything else is `components/ui/*` directly.

## Available shadcn-vue primitives

`components/ui/` holds: `alert`, `avatar`, `badge`, `button`, `card`, `collapsible`, `command`, `dialog`, `dropdown-menu`, `input`, `label`, `scroll-area`, `select`, `separator`, `sheet`, `sidebar`, `skeleton`, `switch`, `textarea`, `toggle`, `toggle-group`, `tooltip`. All compose `reka-ui` primitives, use `cn()` from `components/ui/utils`, and use `cva` for variants.

When a new primitive is needed, follow the same pattern: a folder under `components/ui/`, an `index.ts` re-export, one `.vue` file per part, `reactiveOmit` + `useForwardPropsEmits` for forwarding, `cva` for variants. Do not introduce a Studio wrapper before a primitive — wrappers exist only for repeated **CMS-specific** patterns.

## Page composition

Use full-width operational surfaces, not stacked marketing cards.

- Lists with item-level actions: prefer native tables for tabular data, `StudioListFrame` for irregular lists. Make the row title the link; put actions in a separate `Button` or `DropdownMenu`.
- Multi-section pages with disjoint concerns: prefer `StudioSegmentedControl` with explicit panels over a long scroll.
- Inline status messages: use `Alert` (variant `default | destructive | success | warning | info`) or `StudioNotice`.
- Confirmation dialogs for destructive actions: use the Studio confirmation flow. Reserve `Dialog` for non-destructive forms.
- Filterable selection: use `CommandDialog` for palettes and explicit `Dialog` or `Sheet` flows for selection surfaces.

## Settings layout

Settings pages use `StudioSegmentedControl` for top-level concerns such as General / Members / Locales / Integrations / Diagnostics. Within a panel, sections follow the canonical "left label, right controls" pattern:

```vue
<section class="flex flex-col gap-4 py-8 first:pt-0 md:flex-row md:gap-10">
  <div class="space-y-1 md:w-64 md:shrink-0">
    <h2 class="text-sm font-medium">Section title</h2>
    <p class="text-xs leading-relaxed text-muted-foreground">What this controls.</p>
  </div>
  <div class="min-w-0 flex-1 space-y-4">…</div>
</section>
```

Developer operations (MCP, revalidation, cache tags, event IDs, raw IDs) live in a Diagnostics tab.

## Responsive rules

- Base layout is one column. Use `md:grid-cols-2` only when the container is wide enough.
- Toolbars wrap. Primary actions stay reachable on touch screens.
- Inspector rails are `Sheet` on narrow screens, pinned column on `lg`+.
- Row actions are visible and keyboard reachable, not hover-only.
- Disclosure headers are real `Button` components with `aria-expanded`. Never `<button type="button">` for interactive surfaces.

## Copy rules

- Primary UI terms: content model, public output, website changes, affected pages, readiness, translations.
- Diagnostics terms: projection, cache tags, event IDs, raw IDs, import JSON.
- Avoid em dashes in Studio UI copy and docs touched by this pass.

## What not to do

- No top-level page `Card` shells.
- No nested-card feel. Use `StudioListFrame`, `StudioSection`, native tables, or plain bordered rows.
- No `--studio-*` tokens. No Caveat / accent fonts.
- No raw `<button type="button">` outside of `components/ui/*` primitives.
- No hardcoded hex / rgb / hsl colors. No literal Tailwind palette colors (`bg-emerald-*`, `dark:bg-amber-*`, etc.) — use semantic classes.
- No schema editing controls in Studio.
- No feature flags, v2 routes, compatibility shells, or duplicate workflows.
- No decorative gradients, hero surfaces, or marketing-style layouts.
