import { describe, expect, it } from 'vitest'

import { sanitizeFilename, validateMimeType } from '#component/lib/sanitize.js'

describe('sanitizeFilename', () => {
  it('passes through a normal filename', () => {
    expect(sanitizeFilename('photo.png')).toBe('photo.png')
  })

  it('trims whitespace', () => {
    expect(sanitizeFilename('  hello.txt  ')).toBe('hello.txt')
  })

  it('strips path traversal sequences', () => {
    expect(sanitizeFilename('../../etc/passwd')).toBe('.._.._etc_passwd')
    expect(sanitizeFilename('../../etc/passwd')).not.toContain('/')
  })

  it('strips backslash path separators', () => {
    expect(sanitizeFilename('..\\..\\windows\\system32')).toBe('.._.._windows_system32')
    expect(sanitizeFilename('..\\..\\windows\\system32')).not.toContain('\\')
  })

  it('strips XSS payloads (angle brackets are kept but slashes replaced)', () => {
    const result = sanitizeFilename('<script>alert(1)</script>.png')
    expect(result).not.toContain('/')
    expect(result).not.toContain('\\')
    expect(result.endsWith('.png')).toBe(true)
  })

  it('strips null bytes', () => {
    expect(sanitizeFilename('file\x00name.txt')).toBe('filename.txt')
  })

  it('strips control characters', () => {
    expect(sanitizeFilename('file\x01\x02\x1Fname.txt')).toBe('filename.txt')
  })

  it("returns 'unnamed' for empty string", () => {
    expect(sanitizeFilename('')).toBe('unnamed')
  })

  it("returns 'unnamed' for whitespace-only string", () => {
    expect(sanitizeFilename('   ')).toBe('unnamed')
  })

  it('replaces path separators with underscores', () => {
    expect(sanitizeFilename('///')).toBe('___')
    expect(sanitizeFilename('///')).not.toContain('/')
  })

  it('truncates very long filenames to 255 characters', () => {
    const long = 'a'.repeat(300) + '.png'
    const result = sanitizeFilename(long)
    expect(result.length).toBe(255)
  })

  it('preserves file extension for normal names', () => {
    expect(sanitizeFilename('document.pdf')).toBe('document.pdf')
    expect(sanitizeFilename('image.jpeg')).toBe('image.jpeg')
  })
})

describe('validateMimeType', () => {
  it('accepts valid MIME types', () => {
    expect(() => validateMimeType('image/png')).not.toThrow()
    expect(() => validateMimeType('application/pdf')).not.toThrow()
    expect(() => validateMimeType('text/plain')).not.toThrow()
    expect(() => validateMimeType('application/octet-stream')).not.toThrow()
    expect(() => validateMimeType('image/svg+xml')).not.toThrow()
  })

  it('rejects empty string', () => {
    expect(() => validateMimeType('')).toThrow()
  })

  it('rejects string without slash', () => {
    expect(() => validateMimeType('notamime')).toThrow()
  })

  it('rejects path traversal as MIME type', () => {
    expect(() => validateMimeType('../../../etc')).toThrow()
  })

  it('rejects MIME type with only slash', () => {
    expect(() => validateMimeType('/')).toThrow()
  })

  it('rejects MIME type with empty subtype', () => {
    expect(() => validateMimeType('image/')).toThrow()
  })

  it('rejects MIME type with empty type', () => {
    expect(() => validateMimeType('/png')).toThrow()
  })

  it('rejects MIME type with spaces', () => {
    expect(() => validateMimeType('image / png')).toThrow()
  })
})
