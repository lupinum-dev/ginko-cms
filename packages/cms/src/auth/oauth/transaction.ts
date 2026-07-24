const allowedScopes = new Set(['cms.read', 'cms.entries.create', 'cms.entries.edit'])
const maximumSignedQueryLength = 16 * 1024

export interface PendingOAuthTransaction {
  clientId: string
  resource: string
  scopes: string[]
  signedQuery: string
}

function one(parameters: URLSearchParams, name: string): string {
  const values = parameters.getAll(name)
  if (values.length !== 1 || !values[0]) throw new Error('OAUTH_TRANSACTION_INVALID')
  return values[0]
}

function expectedResource(siteUrl: string | undefined): string {
  if (!siteUrl) throw new Error('OAUTH_TRANSACTION_INVALID')
  const site = new URL(siteUrl)
  if (
    site.protocol !== 'https:' ||
    site.username ||
    site.password ||
    site.pathname !== '/' ||
    site.search ||
    site.hash
  ) {
    throw new Error('OAUTH_TRANSACTION_INVALID')
  }
  return new URL('/mcp', site).href
}

export function parseSignedOAuthTransaction(
  fullPath: string,
  siteUrl: string | undefined,
): PendingOAuthTransaction {
  const queryIndex = fullPath.indexOf('?')
  const signedQuery = queryIndex === -1 ? '' : fullPath.slice(queryIndex + 1)
  if (!signedQuery || signedQuery.length > maximumSignedQueryLength) {
    throw new Error('OAUTH_TRANSACTION_INVALID')
  }
  const parameters = new URLSearchParams(signedQuery)
  const clientId = one(parameters, 'client_id')
  const resource = one(parameters, 'resource')
  const scopes = one(parameters, 'scope').split(' ')
  if (
    resource !== expectedResource(siteUrl) ||
    scopes.length === 0 ||
    new Set(scopes).size !== scopes.length ||
    scopes.some((scope) => !scope || !allowedScopes.has(scope))
  ) {
    throw new Error('OAUTH_TRANSACTION_INVALID')
  }
  return { clientId, resource, scopes, signedQuery }
}

export function requirePublicOAuthClient(
  value: unknown,
  expectedClientId: string,
): { clientId: string; clientName: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('OAUTH_TRANSACTION_INVALID')
  }
  const clientId = Reflect.get(value, 'client_id')
  const clientName = Reflect.get(value, 'client_name')
  if (
    clientId !== expectedClientId ||
    typeof clientName !== 'string' ||
    clientName.length === 0 ||
    clientName.length > 200
  ) {
    throw new Error('OAUTH_TRANSACTION_INVALID')
  }
  return { clientId, clientName }
}
