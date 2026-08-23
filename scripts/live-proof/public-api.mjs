export function contentApiPath(endpoint, params) {
  const encoded = Buffer.from(JSON.stringify(params))
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '')
  const chunks = encoded.match(/.{1,100}/g) ?? []
  return `/api/_content/${endpoint}/_/${chunks.join('/')}.json`
}

export function summarizePublicEntries(body, expectedTitle) {
  const entries = body && typeof body === 'object' && Array.isArray(body.result) ? body.result : []
  const selected = expectedTitle
    ? entries.find((entry) => entry?.title === expectedTitle)
    : entries[0]
  return {
    count: entries.length,
    firstData: selected ?? null,
    firstPath: selected?.route?.resolvedPath ?? null,
    firstTitle: selected?.title ?? null,
  }
}

export function liveProofRichBodyMarker(fixtureToken) {
  return `Rich body ${fixtureToken}`
}

export function assertNoDraftProjection(label, value) {
  const raw = JSON.stringify(value)
  if (raw.includes('draftData') || raw.includes('draftVersionId')) {
    throw new Error(`${label} exposed draft-only fields`)
  }
}
