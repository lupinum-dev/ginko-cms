import { inject, provide, ref, type InjectionKey, type Ref } from 'vue'

import type { StudioAssetContext } from './internal/types'

// Lifts the asset browser's current selection up to the /assets page so the
// right-sidebar details panel (which renders in the LAYOUT tree, not the page
// subtree) can reach it through its props getter (RFC Phase 5 step 5 / D4).
//
// The controller is provided by the page and (optionally) published to by the
// StudioAssetBrowser. In the picker context there is no provider, so the browser
// simply skips publishing — the picker keeps using StudioAssetMetadataDialog.
export interface StudioAssetSelectionController {
  /** id of the asset whose details the panel should show; null = no selection */
  selectedAssetId: Ref<string | null>
  /** upload/scope context of the active browser, forwarded to the metadata form */
  assetContext: Ref<StudioAssetContext | undefined>
}

const studioAssetSelectionKey: InjectionKey<StudioAssetSelectionController> = Symbol(
  'studio-asset-selection',
)

export function provideStudioAssetSelection(): StudioAssetSelectionController {
  const controller: StudioAssetSelectionController = {
    selectedAssetId: ref<string | null>(null),
    assetContext: ref<StudioAssetContext | undefined>(undefined),
  }
  provide(studioAssetSelectionKey, controller)
  return controller
}

/** Optional inject: returns null outside a page that provides the controller. */
export function useStudioAssetSelection(): StudioAssetSelectionController | null {
  return inject(studioAssetSelectionKey, null)
}
