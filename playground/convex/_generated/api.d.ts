/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import type * as auth from "../auth.js";
import type * as ginkoCms_agentRuns from "../ginkoCms/agentRuns.js";
import type * as ginkoCms_assets from "../ginkoCms/assets.js";
import type * as ginkoCms_backup from "../ginkoCms/backup.js";
import type * as ginkoCms_collections from "../ginkoCms/collections.js";
import type * as ginkoCms_diagnostics from "../ginkoCms/diagnostics.js";
import type * as ginkoCms_editor from "../ginkoCms/editor.js";
import type * as ginkoCms_mcpCredentials from "../ginkoCms/mcpCredentials.js";
import type * as ginkoCms_members from "../ginkoCms/members.js";
import type * as ginkoCms_migrations from "../ginkoCms/migrations.js";
import type * as ginkoCms_policy from "../ginkoCms/policy.js";
import type * as ginkoCms_portability from "../ginkoCms/portability.js";
import type * as ginkoCms_public from "../ginkoCms/public.js";
import type * as ginkoCms_revalidation from "../ginkoCms/revalidation.js";
import type * as ginkoCms_reviewRequests from "../ginkoCms/reviewRequests.js";
import type * as ginkoCms_settings from "../ginkoCms/settings.js";
import type * as ginkoCms_siteData from "../ginkoCms/siteData.js";
import type * as http from "../http.js";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  "ginkoCms/agentRuns": typeof ginkoCms_agentRuns;
  "ginkoCms/assets": typeof ginkoCms_assets;
  "ginkoCms/backup": typeof ginkoCms_backup;
  "ginkoCms/collections": typeof ginkoCms_collections;
  "ginkoCms/diagnostics": typeof ginkoCms_diagnostics;
  "ginkoCms/editor": typeof ginkoCms_editor;
  "ginkoCms/mcpCredentials": typeof ginkoCms_mcpCredentials;
  "ginkoCms/members": typeof ginkoCms_members;
  "ginkoCms/migrations": typeof ginkoCms_migrations;
  "ginkoCms/policy": typeof ginkoCms_policy;
  "ginkoCms/portability": typeof ginkoCms_portability;
  "ginkoCms/public": typeof ginkoCms_public;
  "ginkoCms/revalidation": typeof ginkoCms_revalidation;
  "ginkoCms/reviewRequests": typeof ginkoCms_reviewRequests;
  "ginkoCms/settings": typeof ginkoCms_settings;
  "ginkoCms/siteData": typeof ginkoCms_siteData;
  http: typeof http;
}>;
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;
