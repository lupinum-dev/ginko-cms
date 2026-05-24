export const EMOJI_REGEXP = /:\+1:|:[\w-]+:/g

const emojiMap: Record<string, string> = {
  '-1': '\u{1F44E}',
  '+1': '\u{1F44D}',
  book: '\u{1F4D6}',
  boom: '\u{1F4A5}',
  bug: '\u{1F41B}',
  bulb: '\u{1F4A1}',
  check: '\u{2705}',
  clap: '\u{1F44F}',
  eyes: '\u{1F440}',
  fire: '\u{1F525}',
  gear: '\u{2699}\u{FE0F}',
  hammer: '\u{1F528}',
  heart: '\u{2764}\u{FE0F}',
  info: '\u{2139}\u{FE0F}',
  key: '\u{1F511}',
  link: '\u{1F517}',
  lock: '\u{1F512}',
  memo: '\u{1F4DD}',
  party_popper: '\u{1F389}',
  rocket: '\u{1F680}',
  smile: '\u{1F604}',
  sparkles: '\u{2728}',
  star: '\u{2B50}',
  tada: '\u{1F389}',
  thinking: '\u{1F914}',
  thumbsdown: '\u{1F44E}',
  thumbsup: '\u{1F44D}',
  warning: '\u{26A0}\u{FE0F}',
  wrench: '\u{1F527}',
  x: '\u{274C}',
  zap: '\u{26A1}',
}

export function getEmojiName(unicode: string): string {
  const entry = Object.entries(emojiMap).find(([, value]) => value === unicode)
  return entry ? entry[0] : unicode
}

export function getEmojiUnicode(name: string): string {
  return emojiMap[name] || name
}
