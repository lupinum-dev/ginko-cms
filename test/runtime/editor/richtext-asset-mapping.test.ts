import { describe, expect, it } from 'vitest'

import {
  mapStudioAssetToFileInfo,
  mapStudioAssetToImageInfo,
} from '../../../packages/cms/studio-app/src/components/studio/fields/richtextAssetMapping'

describe('richtext asset mapping', () => {
  it('maps localized studio image assets into editor image payloads', () => {
    const asset = {
      _id: 'asset_img_1',
      alt: { de: 'Titelbild', en: 'Hero image' },
      caption: { en: 'Homepage hero' },
      filename: 'hero.png',
      height: 720,
      mimeType: 'image/png',
      size: 1024,
      url: 'https://cdn.example.com/hero.png',
      width: 1280,
    }

    expect(mapStudioAssetToImageInfo(asset, 'en')).toEqual({
      alt: 'Hero image',
      filename: 'hero.png',
      height: 720,
      id: 'asset_img_1',
      mimeType: 'image/png',
      size: 1024,
      title: 'Homepage hero',
      url: 'https://cdn.example.com/hero.png',
      width: 1280,
    })
  })

  it('maps studio file assets into editor file payloads', () => {
    const asset = {
      _id: 'asset_file_1',
      caption: { en: 'Quarterly report' },
      filename: 'report.pdf',
      mimeType: 'application/pdf',
      size: 4096,
      url: 'https://cdn.example.com/report.pdf',
    }

    expect(mapStudioAssetToFileInfo(asset, 'en')).toEqual({
      filename: 'report.pdf',
      id: 'asset_file_1',
      mimeType: 'application/pdf',
      size: 4096,
      title: 'Quarterly report',
      url: 'https://cdn.example.com/report.pdf',
    })
  })
})
