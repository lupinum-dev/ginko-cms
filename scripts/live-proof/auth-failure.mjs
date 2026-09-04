export async function describeSanitizedAuthFailure(response, sensitiveValues) {
  let text = (await response.text()).slice(0, 2_048)
  for (const value of sensitiveValues) {
    if (value) text = text.replaceAll(value, '[redacted]')
  }
  try {
    const body = JSON.parse(text)
    return JSON.stringify({
      code: typeof body?.code === 'string' ? body.code : undefined,
      message: typeof body?.message === 'string' ? body.message : undefined,
      status: typeof body?.status === 'string' ? body.status : undefined,
      statusCode: typeof body?.statusCode === 'number' ? body.statusCode : undefined,
    })
  } catch {
    return 'non_json_error'
  }
}
