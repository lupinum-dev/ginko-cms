# Theming the Studio

The Ginko CMS studio ships with its own isolated Tailwind build and semantic
theme variables. Host applications can theme the studio by overriding
`--ginko-cms-*` CSS custom properties, but host utility classes and host
Tailwind theme values do not drive the studio internals.

## How It Works

The studio renders inside a `.ginko-cms` root element. Internally, every
Tailwind utility class is compiled with the `ginko:` prefix, for example
`ginko:flex`, `ginko:p-4`, and `ginko:hover:bg-muted`. This keeps the CMS safe
from the host app's Tailwind utilities, preflight decisions, custom spacing
scale, and component classes.

You do not write `ginko:` classes in your app to theme the CMS. The prefix is an
internal implementation detail. The public theming API is CSS variables.

Define overrides on `:root`, `.dark`, or a wrapper around the studio route:

```css
:root {
  --ginko-cms-studio-action: oklch(0.62 0.22 255);
  --ginko-cms-studio-action-foreground: oklch(0.99 0 0);
}

.dark {
  --ginko-cms-dark-studio-action: oklch(0.74 0.16 250);
  --ginko-cms-dark-studio-action-foreground: oklch(0.14 0 0);
}
```

The studio stylesheet handles:

- a prefixed Tailwind utility build (`prefix(ginko)`)
- default semantic variables for light and dark mode
- `color-scheme: light` / `color-scheme: dark` for browser form rendering
- `.ginko-cms--sidebar-dark` for the optional dark sidebar in light mode

## CSS Variables

Prefer the namespaced variables below. They are stable host-facing overrides.
The studio maps them into its internal shadcn-style variables (`--primary`,
`--card`, `--success`, etc.) inside `.ginko-cms`.

### Colors

Define these on `:root` for light mode. Values should be in oklch format for
consistency with Tailwind CSS v4.

| Variable                                | Purpose                        |
| --------------------------------------- | ------------------------------ |
| `--ginko-cms-background`                | Page background                |
| `--ginko-cms-foreground`                | Default text color             |
| `--ginko-cms-card`                      | Card surface                   |
| `--ginko-cms-card-foreground`           | Card text                      |
| `--ginko-cms-popover`                   | Popover / dropdown surface     |
| `--ginko-cms-popover-foreground`        | Popover text                   |
| `--ginko-cms-studio-action`             | Primary actions                |
| `--ginko-cms-studio-action-foreground`  | Text on primary actions        |
| `--ginko-cms-secondary`                 | Secondary controls             |
| `--ginko-cms-secondary-foreground`      | Text on secondary controls     |
| `--ginko-cms-muted`                     | Muted backgrounds              |
| `--ginko-cms-muted-foreground`          | De-emphasized text             |
| `--ginko-cms-accent`                    | Hover / active highlights      |
| `--ginko-cms-accent-foreground`         | Text on accent surfaces        |
| `--ginko-cms-destructive`               | Destructive actions            |
| `--ginko-cms-destructive-foreground`    | Text on destructive actions    |
| `--ginko-cms-destructive-fg`            | Destructive text               |
| `--ginko-cms-studio-success`            | Success surfaces               |
| `--ginko-cms-studio-success-foreground` | Text on solid success surfaces |
| `--ginko-cms-studio-success-fg`         | Success text                   |
| `--ginko-cms-warning`                   | Warning surfaces               |
| `--ginko-cms-warning-foreground`        | Text on solid warning surfaces |
| `--ginko-cms-warning-fg`                | Warning text                   |
| `--ginko-cms-border`                    | Default border color           |
| `--ginko-cms-input`                     | Input field borders            |
| `--ginko-cms-ring`                      | Focus ring color               |

Dark-mode equivalents use the `--ginko-cms-dark-*` prefix, for example
`--ginko-cms-dark-background` and `--ginko-cms-dark-studio-action`.

### Sidebar

| Variable                                        | Purpose                     |
| ----------------------------------------------- | --------------------------- |
| `--ginko-cms-sidebar`                           | Sidebar background          |
| `--ginko-cms-sidebar-foreground`                | Sidebar text                |
| `--ginko-cms-studio-sidebar-primary`            | Sidebar active item         |
| `--ginko-cms-studio-sidebar-primary-foreground` | Text on sidebar active item |
| `--ginko-cms-sidebar-accent`                    | Sidebar hover highlight     |
| `--ginko-cms-sidebar-accent-foreground`         | Text on sidebar hover       |
| `--ginko-cms-sidebar-border`                    | Sidebar border              |
| `--ginko-cms-sidebar-ring`                      | Sidebar focus ring          |

### Layout and Fonts

| Variable                      | Purpose                                                 |
| ----------------------------- | ------------------------------------------------------- |
| `--ginko-cms-radius`          | Base border radius (other radii are computed from this) |
| `--font-body`                 | Body text font family                                   |
| `--font-heading`              | Heading font family                                     |
| `--font-mono`                 | Monospace / code font family                            |
| `--ginko-cms-studio-shell-bg` | Studio shell background                                 |
| `--ginko-cms-studio-surface`  | Neutral content surface                                 |
| `--ginko-cms-studio-panel`    | Raised panel surface                                    |
| `--ginko-cms-studio-divider`  | Soft dividers                                           |

## Example

A minimal host CSS file that themes the studio:

```css
@import 'tailwindcss';

:root {
  --ginko-cms-radius: 0.625rem;
  --font-body: 'Inter', sans-serif;
  --font-heading: 'Inter', sans-serif;
  --font-mono: 'JetBrains Mono', monospace;

  --ginko-cms-background: oklch(1 0 0);
  --ginko-cms-foreground: oklch(0.145 0 0);
  --ginko-cms-card: oklch(1 0 0);
  --ginko-cms-card-foreground: oklch(0.145 0 0);
  --ginko-cms-studio-action: oklch(0.62 0.22 255);
  --ginko-cms-studio-action-foreground: oklch(0.99 0 0);
  --ginko-cms-muted: oklch(0.97 0 0);
  --ginko-cms-muted-foreground: oklch(0.556 0 0);
  --ginko-cms-border: oklch(0.922 0 0);
  --ginko-cms-input: oklch(0.922 0 0);
  --ginko-cms-sidebar: oklch(0.985 0 0);
  --ginko-cms-sidebar-foreground: oklch(0.145 0 0);
  --ginko-cms-sidebar-accent: oklch(0.97 0 0);
  --ginko-cms-sidebar-border: oklch(0.922 0 0);
}

.dark {
  --ginko-cms-dark-background: oklch(0.145 0 0);
  --ginko-cms-dark-foreground: oklch(0.985 0 0);
  --ginko-cms-dark-card: oklch(0.205 0 0);
  --ginko-cms-dark-card-foreground: oklch(0.985 0 0);
  --ginko-cms-dark-studio-action: oklch(0.74 0.16 250);
  --ginko-cms-dark-studio-action-foreground: oklch(0.14 0 0);
  --ginko-cms-dark-muted: oklch(0.269 0 0);
  --ginko-cms-dark-muted-foreground: oklch(0.708 0 0);
  --ginko-cms-dark-border: oklch(1 0 0 / 10%);
  --ginko-cms-dark-input: oklch(1 0 0 / 15%);
  --ginko-cms-dark-sidebar: oklch(0.205 0 0);
  --ginko-cms-dark-sidebar-foreground: oklch(0.985 0 0);
  --ginko-cms-dark-sidebar-accent: oklch(0.269 0 0);
  --ginko-cms-dark-sidebar-border: oklch(1 0 0 / 10%);
}
```

To add brand color, change the studio action variables. For example, a blue
primary:

```css
:root {
  --ginko-cms-studio-action: oklch(0.62 0.22 255);
  --ginko-cms-studio-action-foreground: oklch(0.99 0 0);
}
```

## Dark Sidebar

By default, the sidebar follows your light/dark theme like any other surface.
To force a dark sidebar even in light mode (common for admin panels), set the
module option:

```typescript
// nuxt.config.ts
export default defineNuxtConfig({
  ginkoCms: {
    sidebar: { dark: true },
  },
})
```

When `sidebar.dark` is enabled:

- **Light mode**: The sidebar uses hardcoded dark values (near-black background,
  light text). Your `--sidebar-*` light-mode variables are overridden.
- **Dark mode**: The sidebar inherits from your dark theme's `--card`,
  `--primary`, `--accent`, etc. -- it blends naturally with the rest of the UI.

When `sidebar.dark` is disabled (the default):

- The sidebar uses your `--sidebar-*` variables in both modes, matching the
  rest of the app.

## Dark Mode

The studio uses `@nuxtjs/color-mode` with `classSuffix: ""`. This means the
`.dark` class is toggled on the `<html>` element. Your `.dark { ... }` variable
block applies automatically.

The `@custom-variant dark (&:is(.dark *));` directive in your Tailwind CSS
entry file ensures Tailwind's `dark:` utilities work with this class-based
approach.

## Generating a Color Palette

The easiest way to generate a compatible set of oklch variables is to use
[shadcn/ui themes](https://ui.shadcn.com/themes). Pick a theme, copy the CSS
variables, and paste them into your `:root` and `.dark` blocks. The variable
names are the same ones the studio expects.
