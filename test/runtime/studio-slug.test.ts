import { describe, expect, it } from 'vitest'

import { slugifyStudioText } from '../../packages/cms/studio-app/src/lib/slug'

describe('studio slug helpers', () => {
  it('normalizes title text into URL slugs', () => {
    expect(slugifyStudioText('  Café Launch: What is new?  ')).toBe('cafe-launch-what-is-new')
    expect(slugifyStudioText('Release 2.0 / EN + DE')).toBe('release-2-0-en-plus-de')
  })

  it('keeps German transliterations readable', () => {
    expect(slugifyStudioText('Hallo Welt Übersetzt')).toBe('hallo-welt-uebersetzt')
    expect(slugifyStudioText('Änderungen für Größe & Straße')).toBe(
      'aenderungen-fuer-groesse-and-strasse',
    )
  })

  it('handles common Latin edge cases and symbols', () => {
    expect(slugifyStudioText("L'œuvre & C++ @ Home")).toBe('loeuvre-and-c-plus-plus-at-home')
    expect(slugifyStudioText('Smørrebrød, Łódź, Þingvellir')).toBe('smorrebrod-lodz-thingvellir')
  })
})
