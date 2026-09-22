import type { AuthoringKitSourceV1 } from '@lupinum/ginko-editor'

/** One image contract for stored MDC, public rendering, and Studio authoring. */
export const imageAuthoring = {
  version: 1,
  policy: {
    version: 2,
    components: {
      image: {
        kind: 'block',
        props: {
          src: { types: ['asset'], required: true, allowedValues: null },
          id: { types: ['string'], required: false, allowedValues: null },
          filename: { types: ['string'], required: false, allowedValues: null },
          alt: { types: ['string'], required: false, allowedValues: null },
          title: { types: ['string'], required: false, allowedValues: null },
          width: { types: ['string', 'number'], required: false, allowedValues: null },
          height: { types: ['string', 'number'], required: false, allowedValues: null },
        },
        slots: [],
        allowedParents: null,
        allowedChildren: [],
        media: { sourceProp: 'src', altProp: 'alt', titleProp: 'title', filenameProp: 'filename' },
      },
    },
  },
  implementation: {
    image: {
      componentName: 'ContentImage',
      props: {
        src: { types: ['string'], required: true },
        id: { types: ['string'], required: false },
        filename: { types: ['string'], required: false },
        alt: { types: ['string'], required: false },
        title: { types: ['string'], required: false },
        width: { types: ['string', 'number'], required: false },
        height: { types: ['string', 'number'], required: false },
      },
      slots: [],
    },
  },
  authoring: {
    image: { label: 'Image', props: { alt: { control: 'text', label: 'Image description' } } },
  },
  recipes: [],
} as const satisfies AuthoringKitSourceV1
