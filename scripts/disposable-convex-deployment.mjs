function requiredString(value, name) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${name} is required for disposable Convex staging.`)
  }
  return value.trim()
}

function deploymentHostname(value, name, suffix) {
  let url
  try {
    url = new URL(requiredString(value, name))
  } catch {
    throw new Error(`${name} must be an absolute HTTPS URL.`)
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    !url.hostname.endsWith(suffix)
  ) {
    throw new Error(`${name} must be a bare Convex HTTPS origin.`)
  }
  return url.hostname
}

export function validateDisposableConvexDeployment(env = process.env) {
  if (env.GINKO_CMS_DISPOSABLE_DEPLOYMENT !== '1') {
    throw new Error(
      'GINKO_CMS_DISPOSABLE_DEPLOYMENT=1 is required; never run release proof against a shared deployment.',
    )
  }

  const deployment = requiredString(env.CONVEX_DEPLOYMENT, 'CONVEX_DEPLOYMENT')
  const match = /^dev:([a-z0-9][a-z0-9-]*)$/u.exec(deployment)
  if (!match) {
    throw new Error('Release proof requires a dedicated development deployment, never production.')
  }
  const deploymentName = match[1]
  const deployKey = requiredString(env.CONVEX_DEPLOY_KEY, 'CONVEX_DEPLOY_KEY')
  if (!deployKey.startsWith(`dev:${deploymentName}|`)) {
    throw new Error('CONVEX_DEPLOY_KEY does not belong to the configured development deployment.')
  }

  const cloudHostname = deploymentHostname(env.CONVEX_URL, 'CONVEX_URL', '.convex.cloud')
  if (cloudHostname.split('.')[0] !== deploymentName) {
    throw new Error('CONVEX_URL does not belong to the configured development deployment.')
  }

  const siteHostname = deploymentHostname(env.CONVEX_SITE_URL, 'CONVEX_SITE_URL', '.convex.site')
  if (siteHostname.split('.')[0] !== deploymentName) {
    throw new Error('CONVEX_SITE_URL does not belong to the configured development deployment.')
  }

  return { deployment, deploymentName }
}
