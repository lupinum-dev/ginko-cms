import { describe, expect, it } from 'vitest'

import * as component from '../../packages/convex/src/contractTransitions'
import * as host from '../../playground/convex/ginkoCms/contractTransitions'

describe('Contract transition deployment boundary', () => {
  it('exports component functions across the component boundary while keeping every host endpoint internal', () => {
    const names = Object.keys(component)
    expect(names).toHaveLength(8)
    expect(Object.keys(host).sort()).toEqual(names.sort())
    for (const name of names) {
      const componentRegistration = Reflect.get(component, name)
      const hostRegistration = Reflect.get(host, name)
      expect(componentRegistration.isPublic, name).toBe(true)
      expect(componentRegistration.isInternal, name).toBeUndefined()
      expect(hostRegistration.isInternal, name).toBe(true)
      expect(hostRegistration.isPublic, name).toBeUndefined()
    }
  })
})
