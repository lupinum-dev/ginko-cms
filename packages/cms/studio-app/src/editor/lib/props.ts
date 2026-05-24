export function isValidAttr(value?: null | string) {
  if (!value) {
    return false
  }
  const trimmed = String(value).trim()
  if (!trimmed) {
    return false
  }
  const lower = trimmed.toLowerCase()
  return lower !== 'null' && lower !== 'undefined'
}

export function sanitizeImageUrl(url: string): null | string {
  const value = url.trim()
  if (!value) {
    return null
  }

  if (
    value.startsWith('./') ||
    value.startsWith('../') ||
    value.startsWith('/') ||
    value.startsWith('data:image/')
  ) {
    return value
  }

  try {
    const parsed = new URL(value)
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return value
    }
  } catch {
    return null
  }

  return null
}

export function cleanSpanProps(attrs?: Record<string, unknown> | null) {
  const props: Record<string, string> = {}
  if (isValidAttr(attrs?.style as string)) props.style = String(attrs!.style).trim()
  if (isValidAttr((attrs as Record<string, unknown>)?.class as string))
    props.class = String((attrs as Record<string, unknown>).class).trim()
  return props
}

export function normalizeProps(
  nodeProps: Record<string, unknown>,
  extraProps: object,
): Array<[string, string]> {
  return Object.entries({ ...nodeProps, ...extraProps })
    .map(([key, value]) => {
      if (key === 'className') {
        return [
          'class',
          typeof value === 'string' ? value : (value as Array<string>).join(' '),
        ] as [string, string]
      }
      return [key.trim(), String(value).trim()] as [string, string]
    })
    .filter(([key]) => Boolean(String(key).trim()))
}
