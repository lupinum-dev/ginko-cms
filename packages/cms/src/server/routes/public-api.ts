import { serverConvex, type ServerConvexCaller } from 'better-convex-nuxt/server'
import { createError, defineEventHandler, getQuery, getRequestURL } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'

import { api } from '#convex/api'

import {
  resolveContentRuntimePolicy,
  type ContentRuntimeConfig,
} from '../utils/content-runtime-policy.js'

type QueryValue = string | string[] | undefined

type CmsErrorData = {
  code: string
  message: string
  details?: Record<string, unknown> | null
}

type RuntimePublicConfig = {
  convex?: { url?: string }
  content?: { defaultLocale?: string; locales?: string[] }
}

type RuntimeConfig = ContentRuntimeConfig & {
  public?: RuntimePublicConfig
}

const PUBLIC_QUERY_MAX_LENGTH = 256
const PUBLIC_STRING_MAX_LENGTH = 512
const PUBLIC_LOCALE_MAX_LENGTH = 32
const PUBLIC_COLLECTION_MAX_LENGTH = 80

type PublicQueryRef = Parameters<ServerConvexCaller['query']>[0]
type GinkoPublicApiRefs = {
  page: PublicQueryRef
  list: PublicQueryRef
  nav: PublicQueryRef
  surround: PublicQueryRef
  search: PublicQueryRef
  sitemap: PublicQueryRef
  singleton: PublicQueryRef
  siteData: PublicQueryRef
}
const ginkoPublicApi = (
  api as unknown as {
    ginkoCms: { public: GinkoPublicApiRefs }
  }
).ginkoCms.public

function queryString(value: QueryValue) {
  const first = Array.isArray(value) ? value[0] : value
  return typeof first === 'string' && first.length ? first : undefined
}

function rejectQueryParameter(
  name: string,
  message: string,
  details: Record<string, unknown> = {},
): never {
  throw createError({
    statusCode: 400,
    statusMessage: message,
    data: {
      code: 'INVALID_QUERY_PARAMETER',
      message,
      details: { parameter: name, ...details },
    },
  })
}

function assertMaxLength(value: string, name: string, maxLength: number) {
  if (value.length <= maxLength) return
  rejectQueryParameter(name, `${name} must be at most ${maxLength} characters.`, {
    maxLength,
    length: value.length,
  })
}

function optionalString(value: QueryValue, name: string, maxLength: number) {
  const parsed = queryString(value)
  if (parsed === undefined) return undefined
  assertMaxLength(parsed, name, maxLength)
  return parsed
}

function requiredString(value: QueryValue, name: string, maxLength = PUBLIC_STRING_MAX_LENGTH) {
  const parsed = queryString(value)
  if (!parsed) {
    throw createError({
      statusCode: 400,
      statusMessage: `Missing required query parameter: ${name}`,
      data: {
        code: 'MISSING_QUERY_PARAMETER',
        message: `Missing required query parameter: ${name}`,
        details: { parameter: name },
      },
    })
  }
  assertMaxLength(parsed, name, maxLength)
  return parsed
}

function defaultLocaleFor(runtimeConfig: RuntimeConfig) {
  return resolveContentRuntimePolicy(runtimeConfig).defaultLocale
}

function localeString(value: QueryValue, runtimeConfig: RuntimeConfig) {
  const locale = queryString(value) ?? defaultLocaleFor(runtimeConfig)
  assertMaxLength(locale, 'locale', PUBLIC_LOCALE_MAX_LENGTH)
  return locale
}

function optionalNumber(value: QueryValue) {
  const parsed = queryString(value)
  if (!parsed) return undefined
  const number = Number(parsed)
  if (!Number.isInteger(number)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Numeric query parameter must be an integer.',
      data: {
        code: 'INVALID_QUERY_PARAMETER',
        message: 'Numeric query parameter must be an integer.',
      },
    })
  }
  return number
}

function normalizeCmsErrorData(data: unknown): CmsErrorData | null {
  if (typeof data === 'string') {
    try {
      return normalizeCmsErrorData(JSON.parse(data))
    } catch {
      return null
    }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  const record = data as Record<string, unknown>
  if (typeof record.code !== 'string' || typeof record.message !== 'string') return null
  const details =
    record.details && typeof record.details === 'object' && !Array.isArray(record.details)
      ? (record.details as Record<string, unknown>)
      : null
  return { code: record.code, message: record.message, details }
}

function getCmsErrorData(error: unknown) {
  if (!error || typeof error !== 'object' || !('data' in error)) return null
  return normalizeCmsErrorData((error as { data?: unknown }).data)
}

function statusForCmsCode(code: string) {
  return code.startsWith('INVALID_') ||
    code.startsWith('MISSING_') ||
    code === 'DATA_ONLY_COLLECTION'
    ? 400
    : 500
}

export default defineEventHandler(async (event) => {
  const runtimeConfig = useRuntimeConfig(event) as RuntimeConfig
  const convex = serverConvex(event, { auth: 'none' })
  const query = getQuery(event) as Record<string, QueryValue>
  const endpoint = getRequestURL(event).pathname.split('/').filter(Boolean).at(-1)

  try {
    switch (endpoint) {
      case 'page':
        return await convex.query(ginkoPublicApi.page, {
          collection: requiredString(query.collection, 'collection', PUBLIC_COLLECTION_MAX_LENGTH),
          locale: localeString(query.locale, runtimeConfig),
          path: requiredString(query.path, 'path'),
        })
      case 'list':
        return await convex.query(ginkoPublicApi.list, {
          collection: requiredString(query.collection, 'collection', PUBLIC_COLLECTION_MAX_LENGTH),
          locale: localeString(query.locale, runtimeConfig),
          limit: optionalNumber(query.limit),
          cursor: optionalString(query.cursor, 'cursor', PUBLIC_STRING_MAX_LENGTH) ?? null,
          sort: optionalString(query.sort, 'sort', PUBLIC_STRING_MAX_LENGTH),
        })
      case 'nav':
        return await convex.query(ginkoPublicApi.nav, {
          collection: requiredString(query.collection, 'collection', PUBLIC_COLLECTION_MAX_LENGTH),
          locale: localeString(query.locale, runtimeConfig),
        })
      case 'surround':
        return await convex.query(ginkoPublicApi.surround, {
          collection: requiredString(query.collection, 'collection', PUBLIC_COLLECTION_MAX_LENGTH),
          locale: localeString(query.locale, runtimeConfig),
          path: requiredString(query.path, 'path'),
          previous: optionalNumber(query.previous),
          next: optionalNumber(query.next),
        })
      case 'search':
        return await convex.query(ginkoPublicApi.search, {
          query: requiredString(query.query, 'query', PUBLIC_QUERY_MAX_LENGTH),
          locale: localeString(query.locale, runtimeConfig),
          collection: requiredString(query.collection, 'collection', PUBLIC_COLLECTION_MAX_LENGTH),
          limit: optionalNumber(query.limit),
          cursor: optionalString(query.cursor, 'cursor', PUBLIC_STRING_MAX_LENGTH) ?? null,
        })
      case 'sitemap':
        return await convex.query(ginkoPublicApi.sitemap, {
          collection: requiredString(query.collection, 'collection', PUBLIC_COLLECTION_MAX_LENGTH),
          locale: localeString(query.locale, runtimeConfig),
          limit: optionalNumber(query.limit),
          cursor: optionalString(query.cursor, 'cursor', PUBLIC_STRING_MAX_LENGTH) ?? null,
        })
      case 'singleton':
        return await convex.query(ginkoPublicApi.singleton, {
          name: requiredString(query.name, 'name', PUBLIC_COLLECTION_MAX_LENGTH),
          locale: optionalString(query.locale, 'locale', PUBLIC_LOCALE_MAX_LENGTH),
        })
      case 'site-data':
        return await convex.query(ginkoPublicApi.siteData, {
          key: requiredString(query.key, 'key', PUBLIC_COLLECTION_MAX_LENGTH),
          locale: optionalString(query.locale, 'locale', PUBLIC_LOCALE_MAX_LENGTH),
        })
      default:
        throw createError({
          statusCode: 404,
          statusMessage: 'Unknown Ginko public API endpoint.',
        })
    }
  } catch (error) {
    const cmsError = getCmsErrorData(error)
    if (!cmsError) throw error
    throw createError({
      statusCode: statusForCmsCode(cmsError.code),
      statusMessage: cmsError.message,
      data: cmsError,
    })
  }
})
