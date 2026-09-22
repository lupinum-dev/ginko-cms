<script setup lang="ts">
import type { LandingContent } from '../../utils/landingContent'
import { landing_image, landing_link } from '../../utils/landingContent'

defineProps<{ content: LandingContent; editing?: boolean }>()
</script>

<template>
  <main class="landing-page">
    <header class="landing-masthead">
      <span class="landing-wordmark"><span aria-hidden="true">✳</span> Fieldnotes</span>
      <span class="landing-edition">A place for a different perspective</span>
    </header>
    <section class="landing-hero" aria-label="Introduction">
      <div class="landing-copy">
        <p class="landing-eyebrow">
          <slot name="field" field="eyebrow" label="Eyebrow" :value="content.eyebrow">{{
            content.eyebrow
          }}</slot>
        </p>
        <h1>
          <slot name="field" field="title" label="Headline" :value="content.title">{{
            content.title
          }}</slot>
        </h1>
        <div class="landing-introduction">
          <slot
            name="field"
            field="description"
            label="Introduction"
            :value="content.description"
            :multiline="true"
            >{{ content.description }}</slot
          >
        </div>
        <div v-if="editing" class="landing-cta landing-cta-editor">
          <slot name="field" field="cta_label" label="Button label" :value="content.cta_label">{{
            content.cta_label
          }}</slot
          ><span aria-hidden="true">↗</span>
        </div>
        <a
          v-else-if="content.cta_label && landing_link(content.cta_href)"
          class="landing-cta"
          :href="landing_link(content.cta_href)"
          >{{ content.cta_label }} <span aria-hidden="true">↗</span></a
        >
        <slot name="destination" />
      </div>
      <div class="landing-visual">
        <div class="landing-art">
          <img
            v-if="landing_image(content.hero_image)"
            :src="landing_image(content.hero_image)"
            :alt="content.hero_alt"
            class="landing-photo"
          />
          <svg
            v-else
            viewBox="0 0 520 640"
            fill="none"
            role="img"
            aria-label="An abstract landscape of hills, trees, and a rising sun"
          >
            <rect width="520" height="640" fill="#dce4c9" />
            <circle cx="349" cy="154" r="74" fill="#f7e9ad" />
            <path d="M-80 493C40 289 183 262 324 360c90 62 155 76 273 39v270H-80Z" fill="#90a27b" />
            <path d="M-70 583c157-200 364-211 677-63v169H-70Z" fill="#496853" />
            <path d="M206 640c81-130 110-192 69-280" stroke="#d5d5a1" stroke-width="34" />
            <path
              d="M101 439V215M99 360l-45-42M102 314l53-54M423 491V302M425 401l46-43"
              stroke="#294a39"
              stroke-width="9"
            />
            <ellipse cx="94" cy="234" rx="65" ry="109" fill="#365b43" />
            <ellipse cx="429" cy="303" rx="48" ry="88" fill="#31533f" />
          </svg>
          <span v-if="!landing_image(content.hero_image)" class="landing-art-caption"
            >Room to grow.</span
          >
        </div>
        <slot name="image-controls" />
      </div>
    </section>
    <footer class="landing-footer">
      <span>Made for people. Rooted in nature.</span><span>Fieldnotes / 01</span>
    </footer>
  </main>
</template>

<style scoped>
.landing-page {
  background: #f6f5ec;
  color: #263f32;
  padding: 0 clamp(24px, 5vw, 80px);
}
.landing-masthead {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 24px;
  padding: 30px 0;
  border-bottom: 1px solid #cdd2bf;
}
.landing-wordmark {
  font-size: 24px;
  font-weight: 650;
  letter-spacing: -1px;
}
.landing-wordmark span {
  margin-right: 8px;
}
.landing-edition {
  font-size: 12px;
  color: #596850;
}
.landing-hero {
  display: grid;
  grid-template-columns: 1.05fr 1fr;
  gap: clamp(32px, 6vw, 96px);
  padding: 62px 0;
  align-items: center;
}
.landing-copy {
  min-width: 0;
}
.landing-eyebrow {
  margin: 0 0 30px;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  min-height: 1em;
}
h1 {
  font-family: Georgia, serif;
  font-size: clamp(42px, 5.5vw, 82px);
  font-weight: 400;
  line-height: 1.03;
  letter-spacing: -0.045em;
  margin: 0 0 34px;
  overflow-wrap: anywhere;
}
.landing-introduction {
  max-width: 420px;
  font-size: 18px;
  line-height: 1.65;
  color: #53614b;
  white-space: pre-wrap;
}
.landing-cta {
  display: inline-flex;
  gap: 35px;
  align-items: center;
  margin-top: 34px;
  padding: 15px 22px;
  border-radius: 3px;
  background: #294b38;
  color: #fffced;
  text-decoration: none;
  font-size: 14px;
}
.landing-cta-editor {
  max-width: 100%;
}
.landing-cta-editor :deep(textarea:focus) {
  outline-color: #d9eab5;
}
.landing-destination {
  display: grid;
  gap: 6px;
  margin-top: 20px;
  font-size: 12px;
}
.landing-destination input {
  background: #fffef8;
  border: 1px solid #adb99e;
  border-radius: 4px;
  padding: 9px;
  color: #263f32;
}
.landing-art {
  position: relative;
  overflow: hidden;
  border-radius: 48% 48% 3px 3px;
}
.landing-photo {
  display: block;
  width: 100%;
  aspect-ratio: 520 / 640;
  object-fit: cover;
  max-height: 560px;
}
.landing-art svg {
  display: block;
  width: 100%;
  max-height: 560px;
}
.landing-art-caption {
  position: absolute;
  left: 24px;
  bottom: 23px;
  color: #f5f4dd;
  font-family: Georgia, serif;
  font-style: italic;
  font-size: 25px;
}
.landing-footer {
  display: flex;
  justify-content: space-between;
  gap: 20px;
  border-top: 1px solid #cdd2bf;
  padding: 22px 0;
  font-size: 12px;
  color: #596850;
}
@media (max-width: 700px) {
  .landing-edition {
    display: none;
  }
  .landing-hero {
    grid-template-columns: 1fr;
    padding: 42px 0;
  }
  .landing-art {
    max-width: 460px;
    width: 100%;
    margin: auto;
  }
  .landing-art svg {
    max-height: 390px;
  }
  .landing-footer {
    flex-wrap: wrap;
  }
}
</style>
