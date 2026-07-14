/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agentRuns from "../agentRuns.js";
import type * as assets from "../assets.js";
import type * as auth_appIdentity from "../auth/appIdentity.js";
import type * as auth_checks from "../auth/checks.js";
import type * as auth_credentialKind from "../auth/credentialKind.js";
import type * as auth_recordAccess from "../auth/recordAccess.js";
import type * as backup from "../backup.js";
import type * as collections from "../collections.js";
import type * as collections_contracts from "../collections/contracts.js";
import type * as collections_drift from "../collections/drift.js";
import type * as collections_jobs from "../collections/jobs.js";
import type * as collections_sync from "../collections/sync.js";
import type * as crons from "../crons.js";
import type * as diagnostics from "../diagnostics.js";
import type * as editor from "../editor.js";
import type * as entries_bodyAstStorage from "../entries/bodyAstStorage.js";
import type * as entries_context from "../entries/context.js";
import type * as entries_draft from "../entries/draft.js";
import type * as entries_placement from "../entries/placement.js";
import type * as entries_projectionMaintenance from "../entries/projectionMaintenance.js";
import type * as entries_projections from "../entries/projections.js";
import type * as entries_publish from "../entries/publish.js";
import type * as entries_read from "../entries/read.js";
import type * as entries_readiness from "../entries/readiness.js";
import type * as entries_relations from "../entries/relations.js";
import type * as entries_slugs from "../entries/slugs.js";
import type * as entries_tree from "../entries/tree.js";
import type * as entries_versioning from "../entries/versioning.js";
import type * as entries_workflow_assetRefs from "../entries/workflow/assetRefs.js";
import type * as entries_workflow_commands from "../entries/workflow/commands.js";
import type * as entries_workflow_drafts from "../entries/workflow/drafts.js";
import type * as entries_workflow_hashing from "../entries/workflow/hashing.js";
import type * as entries_workflow_path from "../entries/workflow/path.js";
import type * as entries_workflow_projection from "../entries/workflow/projection.js";
import type * as entries_workflow_projectionBuild from "../entries/workflow/projectionBuild.js";
import type * as entries_workflow_renderSafety from "../entries/workflow/renderSafety.js";
import type * as entries_workflow_revisions from "../entries/workflow/revisions.js";
import type * as entries_workflow_subtreeRoutes from "../entries/workflow/subtreeRoutes.js";
import type * as errors from "../errors.js";
import type * as functions from "../functions.js";
import type * as lib from "../lib.js";
import type * as lib_activity from "../lib/activity.js";
import type * as lib_collections from "../lib/collections.js";
import type * as lib_data from "../lib/data.js";
import type * as lib_fields from "../lib/fields.js";
import type * as lib_ids from "../lib/ids.js";
import type * as lib_locale from "../lib/locale.js";
import type * as lib_ordering from "../lib/ordering.js";
import type * as lib_paths from "../lib/paths.js";
import type * as lib_publicData from "../lib/publicData.js";
import type * as lib_sanitize from "../lib/sanitize.js";
import type * as lib_search from "../lib/search.js";
import type * as lib_treeOrder from "../lib/treeOrder.js";
import type * as lib_types from "../lib/types.js";
import type * as lib_utils from "../lib/utils.js";
import type * as lib_validation from "../lib/validation.js";
import type * as mcpCredentials from "../mcpCredentials.js";
import type * as members from "../members.js";
import type * as migrations from "../migrations.js";
import type * as operationHelpers from "../operationHelpers.js";
import type * as operations from "../operations.js";
import type * as policy from "../policy.js";
import type * as portability from "../portability.js";
import type * as portability_assets from "../portability/assets.js";
import type * as portability_exports from "../portability/exports.js";
import type * as portability_items from "../portability/items.js";
import type * as portability_lease from "../portability/lease.js";
import type * as portability_model from "../portability/model.js";
import type * as portability_runs from "../portability/runs.js";
import type * as public_ from "../public.js";
import type * as publicAssets from "../publicAssets.js";
import type * as publicProjectionReads from "../publicProjectionReads.js";
import type * as publicReadAdapter from "../publicReadAdapter.js";
import type * as revalidation from "../revalidation.js";
import type * as reviewRequests from "../reviewRequests.js";
import type * as settings from "../settings.js";
import type * as siteData from "../siteData.js";
import type * as storageMaintenance from "../storageMaintenance.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import { anyApi, componentsGeneric } from "convex/server";

const fullApi: ApiFromModules<{
  agentRuns: typeof agentRuns;
  assets: typeof assets;
  "auth/appIdentity": typeof auth_appIdentity;
  "auth/checks": typeof auth_checks;
  "auth/credentialKind": typeof auth_credentialKind;
  "auth/recordAccess": typeof auth_recordAccess;
  backup: typeof backup;
  collections: typeof collections;
  "collections/contracts": typeof collections_contracts;
  "collections/drift": typeof collections_drift;
  "collections/jobs": typeof collections_jobs;
  "collections/sync": typeof collections_sync;
  crons: typeof crons;
  diagnostics: typeof diagnostics;
  editor: typeof editor;
  "entries/bodyAstStorage": typeof entries_bodyAstStorage;
  "entries/context": typeof entries_context;
  "entries/draft": typeof entries_draft;
  "entries/placement": typeof entries_placement;
  "entries/projectionMaintenance": typeof entries_projectionMaintenance;
  "entries/projections": typeof entries_projections;
  "entries/publish": typeof entries_publish;
  "entries/read": typeof entries_read;
  "entries/readiness": typeof entries_readiness;
  "entries/relations": typeof entries_relations;
  "entries/slugs": typeof entries_slugs;
  "entries/tree": typeof entries_tree;
  "entries/versioning": typeof entries_versioning;
  "entries/workflow/assetRefs": typeof entries_workflow_assetRefs;
  "entries/workflow/commands": typeof entries_workflow_commands;
  "entries/workflow/drafts": typeof entries_workflow_drafts;
  "entries/workflow/hashing": typeof entries_workflow_hashing;
  "entries/workflow/path": typeof entries_workflow_path;
  "entries/workflow/projection": typeof entries_workflow_projection;
  "entries/workflow/projectionBuild": typeof entries_workflow_projectionBuild;
  "entries/workflow/renderSafety": typeof entries_workflow_renderSafety;
  "entries/workflow/revisions": typeof entries_workflow_revisions;
  "entries/workflow/subtreeRoutes": typeof entries_workflow_subtreeRoutes;
  errors: typeof errors;
  functions: typeof functions;
  lib: typeof lib;
  "lib/activity": typeof lib_activity;
  "lib/collections": typeof lib_collections;
  "lib/data": typeof lib_data;
  "lib/fields": typeof lib_fields;
  "lib/ids": typeof lib_ids;
  "lib/locale": typeof lib_locale;
  "lib/ordering": typeof lib_ordering;
  "lib/paths": typeof lib_paths;
  "lib/publicData": typeof lib_publicData;
  "lib/sanitize": typeof lib_sanitize;
  "lib/search": typeof lib_search;
  "lib/treeOrder": typeof lib_treeOrder;
  "lib/types": typeof lib_types;
  "lib/utils": typeof lib_utils;
  "lib/validation": typeof lib_validation;
  mcpCredentials: typeof mcpCredentials;
  members: typeof members;
  migrations: typeof migrations;
  operationHelpers: typeof operationHelpers;
  operations: typeof operations;
  policy: typeof policy;
  portability: typeof portability;
  "portability/assets": typeof portability_assets;
  "portability/exports": typeof portability_exports;
  "portability/items": typeof portability_items;
  "portability/lease": typeof portability_lease;
  "portability/model": typeof portability_model;
  "portability/runs": typeof portability_runs;
  public: typeof public_;
  publicAssets: typeof publicAssets;
  publicProjectionReads: typeof publicProjectionReads;
  publicReadAdapter: typeof publicReadAdapter;
  revalidation: typeof revalidation;
  reviewRequests: typeof reviewRequests;
  settings: typeof settings;
  siteData: typeof siteData;
  storageMaintenance: typeof storageMaintenance;
}> = anyApi as any;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
> = anyApi as any;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
> = anyApi as any;

export const components = componentsGeneric() as unknown as {};
