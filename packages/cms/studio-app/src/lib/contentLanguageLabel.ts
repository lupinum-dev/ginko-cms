/** Prefer configured names, then the interface language's full language name. */
export function contentLanguageLabel(
  code: string,
  locales: ReadonlyArray<{ code: string; label?: string }>,
  displayLocale = 'en',
): string {
  const configured = locales.find((locale) => locale.code === code)?.label
  if (configured && configured.toLowerCase() !== code.toLowerCase()) return configured
  try {
    return new Intl.DisplayNames([displayLocale], { type: 'language' }).of(code) ?? code
  } catch {
    return code
  }
}
