/** Studio and authenticated previews use the host's same-origin byte gateway. */
export function privateAssetUrl(assetId: string) {
  return `/api/_ginko/assets/${encodeURIComponent(assetId)}`
}
