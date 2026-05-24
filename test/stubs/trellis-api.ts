function nestedApiProxy(path: string[] = []): Record<string, unknown> {
  return new Proxy(Object.create(null), {
    get(_target, property) {
      if (typeof property !== 'string') return undefined
      if (property === 'toString') return () => path.join('.')
      return nestedApiProxy([...path, property])
    },
  }) as Record<string, unknown>
}

export const api = nestedApiProxy()
export const internal = nestedApiProxy()
