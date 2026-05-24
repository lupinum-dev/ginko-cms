import { z } from 'zod'

const jsonPrimitive = z.union([z.string(), z.number(), z.boolean(), z.null()])
const jsonValue1 = z.union([
  jsonPrimitive,
  z.array(jsonPrimitive),
  z.record(z.string(), jsonPrimitive),
])
const jsonValue2 = z.union([jsonValue1, z.array(jsonValue1), z.record(z.string(), jsonValue1)])
const jsonValue3 = z.union([jsonValue2, z.array(jsonValue2), z.record(z.string(), jsonValue2)])

export const jsonRecordInputSchema = z.record(z.string(), jsonValue3)
export const localeDraftPatchInputSchema = z.object({
  fields: jsonRecordInputSchema.optional(),
  bodyMdc: z.string().nullable().optional(),
})
