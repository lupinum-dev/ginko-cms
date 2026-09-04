<script setup lang="ts">
import { useCmsI18n } from '#ginko-cms-public/composables/useCmsI18n.js'

import CmsAuthButton from './CmsAuthButton.vue'

const { t, availableLocales, currentLocale, switchLocale } = useCmsI18n()
</script>

<template>
  <div class="ginko-cms ginko-cms--auth cms-auth-layout">
    <div class="cms-auth-layout__panel">
      <div class="cms-auth-layout__brand">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="cms-auth-layout__brand-icon"
          aria-hidden="true"
        >
          <path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3" />
        </svg>
        {{ t('ginkoCms.auth.panel.brand') }}
      </div>
      <div class="cms-auth-layout__panel-copy">
        <blockquote>
          <p>{{ t('ginkoCms.auth.panel.quote') }}</p>
          <footer>{{ t('ginkoCms.auth.panel.author') }}</footer>
        </blockquote>
      </div>
    </div>

    <main class="cms-auth-layout__main">
      <div class="cms-auth-layout__content">
        <slot />
        <div class="cms-auth-layout__locales">
          <CmsAuthButton
            v-for="locale in availableLocales"
            :key="locale.code"
            type="button"
            variant="ghost"
            size="sm"
            class="cms-auth-locale"
            :class="currentLocale === locale.code.slice(0, 2) ? 'cms-auth-locale--active' : ''"
            @click="switchLocale(locale.code)"
          >
            {{ locale.code.toUpperCase() }}
          </CmsAuthButton>
        </div>
      </div>
    </main>
  </div>
</template>

<style>
.ginko-cms--auth {
  --background: var(--ginko-cms-background, oklch(1 0 0));
  --foreground: var(--ginko-cms-foreground, oklch(0.145 0 0));
  --card: var(--ginko-cms-card, oklch(1 0 0));
  --card-foreground: var(--ginko-cms-card-foreground, oklch(0.145 0 0));
  --muted: var(--ginko-cms-muted, oklch(0.97 0 0));
  --muted-foreground: var(--ginko-cms-muted-foreground, oklch(0.556 0 0));
  --accent: var(--ginko-cms-accent, oklch(0.97 0 0));
  --accent-foreground: var(--ginko-cms-accent-foreground, oklch(0.205 0 0));
  --primary: var(--ginko-cms-studio-action, oklch(0.205 0 0));
  --primary-foreground: var(--ginko-cms-studio-action-foreground, oklch(0.985 0 0));
  --destructive: var(--ginko-cms-destructive, oklch(0.577 0.245 27.325));
  --destructive-fg: var(--ginko-cms-destructive-fg, oklch(0.45 0.2 27));
  --border: var(--ginko-cms-border, oklch(0.922 0 0));
  --input: var(--ginko-cms-input, oklch(0.922 0 0));
  --ring: var(--ginko-cms-ring, var(--primary));
  --radius: var(--ginko-cms-radius, 0.625rem);

  min-height: 100dvh;
  background: var(--background);
  color: var(--foreground);
  font-family: var(
    --font-sans,
    'Geist',
    'Inter',
    -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    sans-serif
  );
  font-size: 0.875rem;
}

.cms-auth-layout {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}

.cms-auth-layout__panel {
  display: none;
}

.cms-auth-layout__brand {
  display: flex;
  align-items: center;
  font-size: 1.125rem;
  font-weight: 500;
}

.cms-auth-layout__brand-icon {
  margin-right: 0.5rem;
  width: 1.5rem;
  height: 1.5rem;
  flex-shrink: 0;
}

.cms-auth-layout__panel-copy {
  margin-top: auto;
}

.cms-auth-layout__panel-copy blockquote {
  display: grid;
  gap: 0.5rem;
  margin: 0;
}

.cms-auth-layout__panel-copy p {
  margin: 0;
  max-width: 34rem;
  font-size: 1.125rem;
  line-height: 1.55;
}

.cms-auth-layout__panel-copy footer {
  font-size: 0.875rem;
  opacity: 0.75;
}

.cms-auth-layout__main {
  width: 100%;
  max-width: 32rem;
}

.cms-auth-layout__content {
  width: 100%;
}

.cms-auth-layout__locales {
  margin-top: 1.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
}

.cms-auth-locale {
  border-radius: 999px;
  color: var(--muted-foreground);
}

.cms-auth-locale--active {
  background: var(--foreground);
  color: var(--background);
}

.cms-auth-heading {
  display: grid;
  gap: 0.5rem;
  text-align: center;
}

.cms-auth-heading h1 {
  margin: 0;
  color: var(--foreground);
  font-size: 1.5rem;
  font-weight: 600;
  line-height: 1.2;
  letter-spacing: -0.01em;
}

.cms-auth-heading p {
  margin: 0;
  color: var(--muted-foreground);
  font-size: 0.875rem;
  line-height: 1.5;
}

.cms-auth-stack {
  display: grid;
  gap: 1.5rem;
}

.cms-auth-form {
  display: grid;
  gap: 1rem;
}

.cms-auth-fields {
  display: grid;
  gap: 1rem;
}

.cms-auth-field {
  display: grid;
  gap: 0.5rem;
}

.cms-auth-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--foreground);
  font-size: 0.875rem;
  font-weight: 500;
  line-height: 1;
  user-select: none;
}

.cms-auth-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.cms-auth-message {
  border: 1px solid color-mix(in oklch, var(--primary) 28%, var(--border));
  border-radius: calc(var(--radius) * 0.8);
  background: color-mix(in oklch, var(--primary) 7%, var(--background));
  padding: 0.75rem;
  color: var(--foreground);
  line-height: 1.5;
}

.cms-auth-input {
  width: 100%;
  min-width: 0;
  height: 2rem;
  border: 1px solid var(--input);
  border-radius: calc(var(--radius) * 0.8);
  background: transparent;
  padding: 0.25rem 0.75rem;
  color: var(--foreground);
  font-size: 1rem;
  outline: none;
  box-shadow: 0 1px 2px oklch(0 0 0 / 0.04);
  transition:
    border-color 120ms cubic-bezier(0.22, 1, 0.36, 1),
    box-shadow 120ms cubic-bezier(0.22, 1, 0.36, 1);
}

.cms-auth-input::placeholder {
  color: var(--muted-foreground);
}

.cms-auth-input:focus-visible {
  border-color: var(--ring);
  box-shadow: 0 0 0 3px color-mix(in oklch, var(--ring) 28%, transparent);
}

.cms-auth-input:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

@media (min-width: 768px) {
  .cms-auth-input {
    font-size: 0.875rem;
  }
}

.cms-auth-password {
  position: relative;
}

.cms-auth-password .cms-auth-input {
  padding-right: 2.5rem;
}

.cms-auth-password__toggle {
  position: absolute;
  top: 0;
  right: 0;
  display: inline-flex;
  height: 100%;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: calc(var(--radius) * 0.8);
  background: transparent;
  padding: 0.5rem;
  color: var(--muted-foreground);
  cursor: pointer;
  transition: color 120ms cubic-bezier(0.22, 1, 0.36, 1);
}

.cms-auth-password__toggle:hover {
  color: var(--foreground);
}

.cms-auth-password__toggle:disabled {
  pointer-events: none;
  opacity: 0.5;
}

.cms-auth-password__icon {
  width: 1rem;
  height: 1rem;
}

.cms-auth-submit,
.cms-auth-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  border: 0;
  border-radius: calc(var(--radius) * 0.8);
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
  transition:
    background-color 120ms cubic-bezier(0.22, 1, 0.36, 1),
    color 120ms cubic-bezier(0.22, 1, 0.36, 1),
    opacity 120ms cubic-bezier(0.22, 1, 0.36, 1);
}

.cms-auth-submit {
  width: 100%;
  height: 2rem;
  background: var(--primary);
  color: var(--primary-foreground);
  padding: 0.25rem 0.75rem;
  font-size: 0.875rem;
  box-shadow: 0 1px 2px oklch(0 0 0 / 0.04);
}

.cms-auth-submit:hover {
  background: color-mix(in oklch, var(--primary) 90%, var(--foreground));
}

.cms-auth-submit:disabled,
.cms-auth-button:disabled {
  pointer-events: none;
  opacity: 0.5;
}

.cms-auth-button {
  height: 2rem;
  background: var(--primary);
  color: var(--primary-foreground);
  padding: 0.25rem 0.75rem;
  font-size: 0.875rem;
}

.cms-auth-button--sm {
  height: 1.75rem;
  padding: 0 0.625rem;
  font-size: 0.75rem;
}

.cms-auth-button--ghost {
  background: transparent;
  color: var(--foreground);
}

.cms-auth-button--ghost:hover {
  background: var(--accent);
  color: var(--accent-foreground);
}

.cms-auth-error {
  border-radius: calc(var(--radius) - 2px);
  background: color-mix(in oklch, var(--destructive) 10%, transparent);
  padding: 0.75rem;
  color: var(--destructive-fg, var(--destructive));
  font-size: 0.875rem;
  line-height: 1.45;
}

.cms-auth-link-row {
  color: var(--muted-foreground);
  font-size: 0.875rem;
  text-align: center;
}

.cms-auth-link {
  color: var(--foreground);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.cms-auth-loader {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem 0;
  color: var(--muted-foreground);
}

.cms-auth-spinner {
  display: inline-block;
  width: 2rem;
  height: 2rem;
  border: 2px solid currentcolor;
  border-right-color: transparent;
  border-radius: 9999px;
  animation: cms-auth-spin 1s linear infinite;
}

.cms-auth-spinner--sm {
  width: 1rem;
  height: 1rem;
}

@keyframes cms-auth-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (min-width: 1024px) {
  .cms-auth-layout {
    height: 100dvh;
    padding: 0;
  }

  .cms-auth-layout__panel {
    display: flex;
    height: 100%;
    flex: 1 1 0;
    flex-direction: column;
    border-right: 1px solid var(--border);
    background: var(--foreground);
    padding: 2.5rem;
    color: var(--background);
  }

  .cms-auth-layout__main {
    display: flex;
    flex: 1 1 0;
    max-width: none;
    justify-content: center;
    padding: 2rem;
  }

  .cms-auth-layout__content {
    max-width: 28rem;
    align-self: center;
  }
}
</style>
