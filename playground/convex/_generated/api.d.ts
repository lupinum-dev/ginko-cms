/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as ginkoCms__caller from "../ginkoCms/_caller.js";
import type * as ginkoCms_assets from "../ginkoCms/assets.js";
import type * as ginkoCms_backup from "../ginkoCms/backup.js";
import type * as ginkoCms_collections from "../ginkoCms/collections.js";
import type * as ginkoCms_diagnostics from "../ginkoCms/diagnostics.js";
import type * as ginkoCms_editor from "../ginkoCms/editor.js";
import type * as ginkoCms_imports from "../ginkoCms/imports.js";
import type * as ginkoCms_mcpKeys from "../ginkoCms/mcpKeys.js";
import type * as ginkoCms_members from "../ginkoCms/members.js";
import type * as ginkoCms_migrations from "../ginkoCms/migrations.js";
import type * as ginkoCms_public from "../ginkoCms/public.js";
import type * as ginkoCms_revalidation from "../ginkoCms/revalidation.js";
import type * as ginkoCms_settings from "../ginkoCms/settings.js";
import type * as ginkoCms_siteData from "../ginkoCms/siteData.js";
import type * as ginkoCmsMcp from "../ginkoCmsMcp.js";
import type * as http from "../http.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  "ginkoCms/_caller": typeof ginkoCms__caller;
  "ginkoCms/assets": typeof ginkoCms_assets;
  "ginkoCms/backup": typeof ginkoCms_backup;
  "ginkoCms/collections": typeof ginkoCms_collections;
  "ginkoCms/diagnostics": typeof ginkoCms_diagnostics;
  "ginkoCms/editor": typeof ginkoCms_editor;
  "ginkoCms/imports": typeof ginkoCms_imports;
  "ginkoCms/mcpKeys": typeof ginkoCms_mcpKeys;
  "ginkoCms/members": typeof ginkoCms_members;
  "ginkoCms/migrations": typeof ginkoCms_migrations;
  "ginkoCms/public": typeof ginkoCms_public;
  "ginkoCms/revalidation": typeof ginkoCms_revalidation;
  "ginkoCms/settings": typeof ginkoCms_settings;
  "ginkoCms/siteData": typeof ginkoCms_siteData;
  ginkoCmsMcp: typeof ginkoCmsMcp;
  http: typeof http;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  betterAuth: import("@convex-dev/better-auth/_generated/component.js").ComponentApi<"betterAuth">;
  ginkoCms: import("@lupinum/ginko-cms-convex/_generated/component.js").ComponentApi<"ginkoCms">;
};
