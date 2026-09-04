const SERVER_ENVIRONMENT_KEYS = [
  'BCN_AUTH_PROXY_IP_SECRET',
  'BCN_AUTH_TRUSTED_CLIENT_IP_HEADER',
  'CMS_STORY_BASE_URL',
  'CONVEX_SITE_URL',
  'CONVEX_URL',
  'NUXT_PUBLIC_CONVEX_SITE_URL',
  'NUXT_PUBLIC_CONVEX_URL',
  'SITE_URL',
]

export function createLiveCandidateServerEnvironment(environment, { host, port }) {
  const serverEnvironment = {
    NODE_ENV: 'production',
    HOST: host,
    PORT: port,
  }
  for (const key of SERVER_ENVIRONMENT_KEYS) {
    const value = environment[key]
    if (typeof value === 'string' && value.length > 0) serverEnvironment[key] = value
  }
  return serverEnvironment
}
