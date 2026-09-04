import assert from 'node:assert/strict'

import {
  assertCmsRequestedFacts,
  parseCmsListWireResult,
  parseCmsNavWireResult,
  parseCmsPageWireResult,
  parseCmsRoutesWireResult,
  parseCmsSearchWireResult,
  parseCmsSiteDataWireResult,
  parseCmsSurroundWireResult,
  validatePublicMarkdownAst,
} from '@lupinum/ginko-content/cms-contract'

const rejects = (operation, label) => {
  assert.throws(() => operation(), undefined, `${label} accepted hostile input`)
}

for (const [label, decoder] of [
  ['page', parseCmsPageWireResult],
  ['list', parseCmsListWireResult],
  ['navigation', parseCmsNavWireResult],
  ['surroundings', parseCmsSurroundWireResult],
  ['search', parseCmsSearchWireResult],
  ['routes', parseCmsRoutesWireResult],
  ['site data', parseCmsSiteDataWireResult],
]) {
  rejects(() => decoder({}), `${label} decoder`)
}

let deepValue = 'leaf'
for (let depth = 0; depth < 80; depth += 1) deepValue = { child: deepValue }
rejects(
  () =>
    parseCmsSiteDataWireResult({
      key: 'hostile-depth',
      data: deepValue,
      locale: { requested: 'en', resolved: 'en', policy: 'strict', fallbacks: { fields: [] } },
    }),
  'bounded wire decoder',
)
rejects(
  () =>
    assertCmsRequestedFacts({
      operation: 'list',
      requested: { collection: 'docs', locale: 'en' },
      returned: { collection: 'other', locale: { requested: 'fr' } },
    }),
  'requested-fact guard',
)

const root = (tag, props = {}) => ({
  type: 'root',
  children: [{ type: 'element', tag, props, children: [] }],
})
for (const [label, ast, issue] of [
  ['script tag', root('script'), 'unsafe_tag'],
  ['style tag', root('style'), 'unsafe_tag'],
  ['iframe tag', root('iframe'), 'unsafe_tag'],
  ['SVG tag', root('svg'), 'unsafe_tag'],
  ['event handler', root('img', { src: '/safe.png', onerror: 'boom' }), 'unsafe_prop'],
  ['javascript URL', root('a', { href: 'javascript:alert(1)' }), 'unsafe_url'],
  ['data URL', root('img', { src: 'data:text/html,boom', alt: '' }), 'unsafe_url'],
]) {
  const result = validatePublicMarkdownAst(ast)
  assert.equal(result.ok, false, `${label} reached the packed render boundary`)
  assert.ok(
    result.issues.some((candidate) => candidate.code === issue),
    `${label} issue missing`,
  )
}
assert.equal(validatePublicMarkdownAst(root('a', { href: '/docs' })).ok, true)

console.log('packed Content safety probes passed')
