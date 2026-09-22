export const landing_field_keys = [
  'title',
  'description',
  'eyebrow',
  'cta_label',
  'cta_href',
  'hero_image',
  'hero_alt',
] as const

export type LandingField = (typeof landing_field_keys)[number]
export type LandingContent = Record<LandingField, string>

export function landing_content(data: Record<string, unknown>): LandingContent {
  return {
    title: typeof data.title === 'string' ? data.title : '',
    description: typeof data.description === 'string' ? data.description : '',
    eyebrow: typeof data.eyebrow === 'string' ? data.eyebrow : '',
    cta_label: typeof data.cta_label === 'string' ? data.cta_label : '',
    cta_href: typeof data.cta_href === 'string' ? data.cta_href : '',
    hero_image: typeof data.hero_image === 'string' ? data.hero_image : '',
    hero_alt: typeof data.hero_alt === 'string' ? data.hero_alt : '',
  }
}

/** URLs come from CMS asset resolution, never an arbitrary editor URL input. */
export function landing_image(value: string): string | undefined {
  return landing_link(value)
}

export function landing_link(value: string): string | undefined {
  if (value.startsWith('/') && !value.startsWith('//') && !value.includes('\\')) return value
  try {
    const url = new URL(value)
    if (url.protocol === 'https:' || url.protocol === 'http:') return url.href
  } catch {
    // An incomplete destination stays inert while the author edits it.
  }
  return undefined
}
