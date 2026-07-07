export const studioWorkflowSpine = [
  { key: 'write', label: 'Write' },
  { key: 'check', label: 'Check' },
  { key: 'preview', label: 'Preview' },
  { key: 'review', label: 'Review' },
  { key: 'publish', label: 'Publish' },
  { key: 'track', label: 'Track' },
] as const

export type StudioWorkflowSpineKey = (typeof studioWorkflowSpine)[number]['key']

export const studioWorkflowSpineText = studioWorkflowSpine.map((step) => step.label).join(' -> ')

export function studioWorkflowLabel(key: StudioWorkflowSpineKey) {
  return studioWorkflowSpine.find((step) => step.key === key)?.label ?? key
}
