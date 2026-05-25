# Tailwind v4 Integration Notes

This module needs Tailwind utility generation for classes that live inside
`@lupinum/ginko-cms` runtime Vue files, while keeping consumer setup minimal.
It also owns its semantic theme tokens for studio and auth surfaces, so
consumers do not need to provide a separate HSL-channel token contract.
For color mode, `ginko-cms` also installs `@nuxtjs/color-mode` when the host
app has not already configured it, and it standardizes on the `.dark` class
contract required by Tailwind CSS v4 dark variants.

## Goal

Consumer apps should only need their normal Tailwind entry CSS, for example:

```css
@import 'tailwindcss';
```

They should not need package-specific `@import` or `@source` lines for
`@lupinum/ginko-cms`, and they should not need to supply legacy
`hsl(var(--token))` channel values to make module pages render correctly.
They also should not need to add `@nuxtjs/color-mode` for Studio dark mode or
to avoid a hard-refresh flash of light mode.

## What Failed

### 1. Standalone CSS with only `@source`

The first attempt pushed a separate CSS file into `nuxt.options.css`:

```css
@source ".";
```

That did not work in Nuxt dev. The browser loaded that file as raw CSS, but
Tailwind never processed it, so the CMS classes were not generated.

Symptom:

- The page HTML contained CMS classes
- The compiled Tailwind asset did not contain those classes
- The UI rendered with partially missing styles

### 2. Injecting `@source` before `@import "tailwindcss"`

Tailwind v4 needs the `@source` registration in the stylesheet that imports
Tailwind itself. Injecting it before the Tailwind import did not produce the
expected result.

Working shape:

```css
@import 'tailwindcss';
@source "../../../node_modules/@lupinum/ginko-cms/dist/runtime";
```

### 3. Pointing `@source` at the package's real filesystem path

For local linked development, targeting the package's real path outside the
consumer app root did not work reliably:

```css
@source "../../../../ginko-cms/packages/cms/src/runtime";
```

What worked was targeting the path as seen from the consumer app:

```css
@source "../../../node_modules/@lupinum/ginko-cms/dist/runtime";
```

This is also the correct shape for installed consumers and linked local
development.

### 4. Appending the Vite transform too late

Even with `enforce: "pre"`, adding the transform after the consumer's existing
Vite plugins was still too late. The Tailwind Vite plugin had already run.

The fix was to place the CMS source-injection plugin at the front of
`nuxt.options.vite.plugins` via `unshift(...)`.

## Final Approach

The module:

1. Detects the consumer-visible installed runtime directory:

   `node_modules/@lupinum/ginko-cms/dist/runtime`

2. Falls back to the local module runtime path when needed
3. Injects `@source "<relative-path>";` into the consumer's actual Tailwind
   entry stylesheet
4. Injects that line immediately after `@import "tailwindcss";`
5. Registers the transform before other Vite plugins
6. Avoids duplicate plugin registration
7. Registers a shared `cms-theme.css` stylesheet once so all module pages use
   the same full-color semantic token baseline under the `.ginko-cms` root
8. Injects the Tailwind v4 `dark` custom variant if the host stylesheet does
   not already define one
9. Installs and configures `@nuxtjs/color-mode` with `classSuffix: ""` when the
   host app has not opted into color mode yet

## Why Nuxt UI Looked Different

Nuxt UI works differently because it exports a stylesheet and the documented
consumer pattern is:

```css
@import 'tailwindcss';
@import '@nuxt/ui';
```

`@lupinum/ginko-cms` does not work like that. It does not need a consumer
stylesheet import. It needs Tailwind source registration for the module's
runtime Vue files, and it expects dark utilities to target the `.dark` class.

Nuxt Studio follows the Nuxt UI pattern for `@nuxt/ui`, and uses `@source` only
for additional content scan paths.

## Debugging Checklist

When this breaks again, check these in order:

1. Confirm the page HTML contains the CMS classes you expect
2. Inspect the compiled Tailwind asset, not only the HTML:

   `/_nuxt/assets/css/tailwind.css`

3. Search that asset for a CMS-only utility, for example:
   - `bg-background`
   - `text-muted-foreground`
   - another class that is only used inside ginko-cms runtime files

4. If the class is missing from the compiled asset, Tailwind source registration
   is still broken
5. If dark mode still flashes on a hard refresh, confirm the page has the
   `@nuxtjs/color-mode` SSR script and that `nuxt.options.colorMode.classSuffix`
   resolves to `""`
6. If rebuilding the linked package cleaned `dist/` mid-dev-session, restart the
   consumer dev server before drawing conclusions

## Verification That Helped

These checks were decisive during debugging:

```bash
curl -s http://localhost:3001/studio/auth/signin
curl -s http://localhost:3001/_nuxt/assets/css/tailwind.css | rg "bg-background|text-muted-foreground"
```

The correct fix was confirmed when module-owned semantic utilities appeared in
the compiled Tailwind asset without adding any CMS-specific line to the
consumer stylesheet.

The dark-mode hard-refresh flash was fixed by using the official
`@nuxtjs/color-mode` SSR path instead of a client-only fallback that toggled the
`.dark` class after hydration.

## Constraints For Future Changes

If this area changes again, keep these constraints:

- Consumer setup must stay minimal
- No standalone CSS file whose only job is `@source`
- No requirement for consumer apps to add package-specific `@source`
- No dependence on host-provided HSL-channel token values
- No client-only fallback for dark mode that waits until hydration to apply
  `.dark`
- Keep at least one regression test around source path selection and plugin order
- Add a higher-level integration test later if we want stronger coverage against
  Nuxt + Tailwind dev behavior

## Related Pages

- [Theming the Studio](../guides/theming-the-studio.md)
