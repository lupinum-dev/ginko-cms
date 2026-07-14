let runtimeConfig: unknown = {}

export function setTestRuntimeConfig(value: unknown) {
  runtimeConfig = value
}

export function useRuntimeConfig() {
  return runtimeConfig
}
