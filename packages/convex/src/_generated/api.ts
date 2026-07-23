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
import type * as assetRecovery from "../assetRecovery.js";
import type * as assetRecovery_archive from "../assetRecovery/archive.js";
import type * as assetRecovery_verification from "../assetRecovery/verification.js";
import type * as assets from "../assets.js";
import type * as assets_assetRecord from "../assets/assetRecord.js";
import type * as assets_cleanupOperations from "../assets/cleanupOperations.js";
import type * as assets_listing from "../assets/listing.js";
import type * as assets_purge from "../assets/purge.js";
import type * as assets_purgeExecution from "../assets/purgeExecution.js";
import type * as assets_purgeOperation from "../assets/purgeOperation.js";
import type * as assets_relationships from "../assets/relationships.js";
import type * as assets_replacement from "../assets/replacement.js";
import type * as assets_replacementUpload from "../assets/replacementUpload.js";
import type * as assets_scope from "../assets/scope.js";
import type * as assets_storageOwnership from "../assets/storageOwnership.js";
import type * as assets_uploadSessions from "../assets/uploadSessions.js";
import type * as auth_appIdentity from "../auth/appIdentity.js";
import type * as auth_checks from "../auth/checks.js";
import type * as auth_recordAccess from "../auth/recordAccess.js";
import type * as collections from "../collections.js";
import type * as collections_contracts from "../collections/contracts.js";
import type * as contract from "../contract.js";
import type * as contractTransitions from "../contractTransitions.js";
import type * as contractTransitions_apply from "../contractTransitions/apply.js";
import type * as contractTransitions_lifecycle from "../contractTransitions/lifecycle.js";
import type * as contractTransitions_model from "../contractTransitions/model.js";
import type * as contractTransitions_staging from "../contractTransitions/staging.js";
import type * as contractTransitions_validation from "../contractTransitions/validation.js";
import type * as crons from "../crons.js";
import type * as diagnostics from "../diagnostics.js";
import type * as diagnostics_publishImpact from "../diagnostics/publishImpact.js";
import type * as diagnostics_shared from "../diagnostics/shared.js";
import type * as diagnostics_visibility from "../diagnostics/visibility.js";
import type * as draftPreview from "../draftPreview.js";
import type * as editor from "../editor.js";
import type * as entries_activity from "../entries/activity.js";
import type * as entries_activityFilters from "../entries/activityFilters.js";
import type * as entries_activityPresentation from "../entries/activityPresentation.js";
import type * as entries_activityRows from "../entries/activityRows.js";
import type * as entries_assetReferenceProof from "../entries/assetReferenceProof.js";
import type * as entries_bodyAstStorage from "../entries/bodyAstStorage.js";
import type * as entries_context from "../entries/context.js";
import type * as entries_destructivePreview from "../entries/destructivePreview.js";
import type * as entries_draft from "../entries/draft.js";
import type * as entries_draftPathConflicts from "../entries/draftPathConflicts.js";
import type * as entries_history from "../entries/history.js";
import type * as entries_inboundRelations from "../entries/inboundRelations.js";
import type * as entries_labels from "../entries/labels.js";
import type * as entries_permanentDelete from "../entries/permanentDelete.js";
import type * as entries_placement from "../entries/placement.js";
import type * as entries_projectionMaintenance from "../entries/projectionMaintenance.js";
import type * as entries_projectionRepairCanonicalPages from "../entries/projectionRepairCanonicalPages.js";
import type * as entries_projectionRepairDerivedPages from "../entries/projectionRepairDerivedPages.js";
import type * as entries_projectionRepairPageSupport from "../entries/projectionRepairPageSupport.js";
import type * as entries_projectionRepairPages from "../entries/projectionRepairPages.js";
import type * as entries_projectionRepairWorker from "../entries/projectionRepairWorker.js";
import type * as entries_projections from "../entries/projections.js";
import type * as entries_publicationApproval from "../entries/publicationApproval.js";
import type * as entries_publicationHistory from "../entries/publicationHistory.js";
import type * as entries_publish from "../entries/publish.js";
import type * as entries_read from "../entries/read.js";
import type * as entries_readiness from "../entries/readiness.js";
import type * as entries_relations from "../entries/relations.js";
import type * as entries_restoreEligibility from "../entries/restoreEligibility.js";
import type * as entries_slugs from "../entries/slugs.js";
import type * as entries_studioInventory from "../entries/studioInventory.js";
import type * as entries_studioKeyset from "../entries/studioKeyset.js";
import type * as entries_studioOverview from "../entries/studioOverview.js";
import type * as entries_studioRows from "../entries/studioRows.js";
import type * as entries_studioSearchIndex from "../entries/studioSearchIndex.js";
import type * as entries_studioSummary from "../entries/studioSummary.js";
import type * as entries_tree from "../entries/tree.js";
import type * as entries_treePolicy from "../entries/treePolicy.js";
import type * as entries_versioning from "../entries/versioning.js";
import type * as entries_workflow_assetRefs from "../entries/workflow/assetRefs.js";
import type * as entries_workflow_commands from "../entries/workflow/commands.js";
import type * as entries_workflow_draftCommands from "../entries/workflow/draftCommands.js";
import type * as entries_workflow_draftPlacement from "../entries/workflow/draftPlacement.js";
import type * as entries_workflow_draftSearch from "../entries/workflow/draftSearch.js";
import type * as entries_workflow_drafts from "../entries/workflow/drafts.js";
import type * as entries_workflow_duplicateEntry from "../entries/workflow/duplicateEntry.js";
import type * as entries_workflow_hashing from "../entries/workflow/hashing.js";
import type * as entries_workflow_historyCommands from "../entries/workflow/historyCommands.js";
import type * as entries_workflow_historyPlacement from "../entries/workflow/historyPlacement.js";
import type * as entries_workflow_lifecycleCommands from "../entries/workflow/lifecycleCommands.js";
import type * as entries_workflow_path from "../entries/workflow/path.js";
import type * as entries_workflow_projection from "../entries/workflow/projection.js";
import type * as entries_workflow_projectionBuild from "../entries/workflow/projectionBuild.js";
import type * as entries_workflow_publicTree from "../entries/workflow/publicTree.js";
import type * as entries_workflow_publicTree_model from "../entries/workflow/publicTree/model.js";
import type * as entries_workflow_publicTree_pathBatch from "../entries/workflow/publicTree/pathBatch.js";
import type * as entries_workflow_publicTree_pathResolution from "../entries/workflow/publicTree/pathResolution.js";
import type * as entries_workflow_publicTree_placement from "../entries/workflow/publicTree/placement.js";
import type * as entries_workflow_publicTree_redirectPlacement from "../entries/workflow/publicTree/redirectPlacement.js";
import type * as entries_workflow_publicTree_redirects from "../entries/workflow/publicTree/redirects.js";
import type * as entries_workflow_publicationCommands from "../entries/workflow/publicationCommands.js";
import type * as entries_workflow_publishImpact from "../entries/workflow/publishImpact.js";
import type * as entries_workflow_renderSafety from "../entries/workflow/renderSafety.js";
import type * as entries_workflow_revisions from "../entries/workflow/revisions.js";
import type * as entries_workflow_routeGeneration from "../entries/workflow/routeGeneration.js";
import type * as entries_workflow_subtreeRoutes from "../entries/workflow/subtreeRoutes.js";
import type * as errors from "../errors.js";
import type * as functions from "../functions.js";
import type * as lib from "../lib.js";
import type * as lib_activity from "../lib/activity.js";
import type * as lib_collections from "../lib/collections.js";
import type * as lib_contentLimits from "../lib/contentLimits.js";
import type * as lib_data from "../lib/data.js";
import type * as lib_fields from "../lib/fields.js";
import type * as lib_ids from "../lib/ids.js";
import type * as lib_installedContract from "../lib/installedContract.js";
import type * as lib_locale from "../lib/locale.js";
import type * as lib_ordering from "../lib/ordering.js";
import type * as lib_paths from "../lib/paths.js";
import type * as lib_publicData from "../lib/publicData.js";
import type * as lib_revalidationOutbox from "../lib/revalidationOutbox.js";
import type * as lib_sanitize from "../lib/sanitize.js";
import type * as lib_search from "../lib/search.js";
import type * as lib_treeOrder from "../lib/treeOrder.js";
import type * as lib_types from "../lib/types.js";
import type * as lib_utils from "../lib/utils.js";
import type * as lib_validation from "../lib/validation.js";
import type * as liveFixtures from "../liveFixtures.js";
import type * as liveFixtures_cleanup from "../liveFixtures/cleanup.js";
import type * as liveFixtures_finalize from "../liveFixtures/finalize.js";
import type * as mcpAuthLimiter from "../mcpAuthLimiter.js";
import type * as mcpCredentials from "../mcpCredentials.js";
import type * as mcpHandler from "../mcpHandler.js";
import type * as members from "../members.js";
import type * as members_invitations from "../members/invitations.js";
import type * as operationHash from "../operationHash.js";
import type * as operationHelpers from "../operationHelpers.js";
import type * as operations from "../operations.js";
import type * as portability from "../portability.js";
import type * as portability_assets from "../portability/assets.js";
import type * as portability_durableHash from "../portability/durableHash.js";
import type * as portability_exportCleanup from "../portability/exportCleanup.js";
import type * as portability_exportModel from "../portability/exportModel.js";
import type * as portability_exportPreflight from "../portability/exportPreflight.js";
import type * as portability_exports from "../portability/exports.js";
import type * as portability_importLifecycle from "../portability/importLifecycle.js";
import type * as portability_importModel from "../portability/importModel.js";
import type * as portability_importPlanning from "../portability/importPlanning.js";
import type * as portability_importWorker from "../portability/importWorker.js";
import type * as portability_items from "../portability/items.js";
import type * as portability_lease from "../portability/lease.js";
import type * as portability_model from "../portability/model.js";
import type * as portability_placement from "../portability/placement.js";
import type * as portability_portableJson from "../portability/portableJson.js";
import type * as portability_runStatus from "../portability/runStatus.js";
import type * as portability_runs from "../portability/runs.js";
import type * as portability_worker from "../portability/worker.js";
import type * as public_ from "../public.js";
import type * as publicAssets from "../publicAssets.js";
import type * as publicPagination from "../publicPagination.js";
import type * as publicProjectionReads from "../publicProjectionReads.js";
import type * as publicReadAdapter from "../publicReadAdapter.js";
import type * as publicReads_discoveryHandlers from "../publicReads/discoveryHandlers.js";
import type * as publicReads_entries from "../publicReads/entries.js";
import type * as publicReads_navigationHandlers from "../publicReads/navigationHandlers.js";
import type * as publicReads_pageHandlers from "../publicReads/pageHandlers.js";
import type * as publicReads_siteHandlers from "../publicReads/siteHandlers.js";
import type * as publicReads_validation from "../publicReads/validation.js";
import type * as redirects from "../redirects.js";
import type * as redirects_inventory from "../redirects/inventory.js";
import type * as revalidation from "../revalidation.js";
import type * as revalidation_diagnostics from "../revalidation/diagnostics.js";
import type * as revalidation_retryOperation from "../revalidation/retryOperation.js";
import type * as revalidation_targets from "../revalidation/targets.js";
import type * as revalidation_worker from "../revalidation/worker.js";
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
  assetRecovery: typeof assetRecovery;
  "assetRecovery/archive": typeof assetRecovery_archive;
  "assetRecovery/verification": typeof assetRecovery_verification;
  assets: typeof assets;
  "assets/assetRecord": typeof assets_assetRecord;
  "assets/cleanupOperations": typeof assets_cleanupOperations;
  "assets/listing": typeof assets_listing;
  "assets/purge": typeof assets_purge;
  "assets/purgeExecution": typeof assets_purgeExecution;
  "assets/purgeOperation": typeof assets_purgeOperation;
  "assets/relationships": typeof assets_relationships;
  "assets/replacement": typeof assets_replacement;
  "assets/replacementUpload": typeof assets_replacementUpload;
  "assets/scope": typeof assets_scope;
  "assets/storageOwnership": typeof assets_storageOwnership;
  "assets/uploadSessions": typeof assets_uploadSessions;
  "auth/appIdentity": typeof auth_appIdentity;
  "auth/checks": typeof auth_checks;
  "auth/recordAccess": typeof auth_recordAccess;
  collections: typeof collections;
  "collections/contracts": typeof collections_contracts;
  contract: typeof contract;
  contractTransitions: typeof contractTransitions;
  "contractTransitions/apply": typeof contractTransitions_apply;
  "contractTransitions/lifecycle": typeof contractTransitions_lifecycle;
  "contractTransitions/model": typeof contractTransitions_model;
  "contractTransitions/staging": typeof contractTransitions_staging;
  "contractTransitions/validation": typeof contractTransitions_validation;
  crons: typeof crons;
  diagnostics: typeof diagnostics;
  "diagnostics/publishImpact": typeof diagnostics_publishImpact;
  "diagnostics/shared": typeof diagnostics_shared;
  "diagnostics/visibility": typeof diagnostics_visibility;
  draftPreview: typeof draftPreview;
  editor: typeof editor;
  "entries/activity": typeof entries_activity;
  "entries/activityFilters": typeof entries_activityFilters;
  "entries/activityPresentation": typeof entries_activityPresentation;
  "entries/activityRows": typeof entries_activityRows;
  "entries/assetReferenceProof": typeof entries_assetReferenceProof;
  "entries/bodyAstStorage": typeof entries_bodyAstStorage;
  "entries/context": typeof entries_context;
  "entries/destructivePreview": typeof entries_destructivePreview;
  "entries/draft": typeof entries_draft;
  "entries/draftPathConflicts": typeof entries_draftPathConflicts;
  "entries/history": typeof entries_history;
  "entries/inboundRelations": typeof entries_inboundRelations;
  "entries/labels": typeof entries_labels;
  "entries/permanentDelete": typeof entries_permanentDelete;
  "entries/placement": typeof entries_placement;
  "entries/projectionMaintenance": typeof entries_projectionMaintenance;
  "entries/projectionRepairCanonicalPages": typeof entries_projectionRepairCanonicalPages;
  "entries/projectionRepairDerivedPages": typeof entries_projectionRepairDerivedPages;
  "entries/projectionRepairPageSupport": typeof entries_projectionRepairPageSupport;
  "entries/projectionRepairPages": typeof entries_projectionRepairPages;
  "entries/projectionRepairWorker": typeof entries_projectionRepairWorker;
  "entries/projections": typeof entries_projections;
  "entries/publicationApproval": typeof entries_publicationApproval;
  "entries/publicationHistory": typeof entries_publicationHistory;
  "entries/publish": typeof entries_publish;
  "entries/read": typeof entries_read;
  "entries/readiness": typeof entries_readiness;
  "entries/relations": typeof entries_relations;
  "entries/restoreEligibility": typeof entries_restoreEligibility;
  "entries/slugs": typeof entries_slugs;
  "entries/studioInventory": typeof entries_studioInventory;
  "entries/studioKeyset": typeof entries_studioKeyset;
  "entries/studioOverview": typeof entries_studioOverview;
  "entries/studioRows": typeof entries_studioRows;
  "entries/studioSearchIndex": typeof entries_studioSearchIndex;
  "entries/studioSummary": typeof entries_studioSummary;
  "entries/tree": typeof entries_tree;
  "entries/treePolicy": typeof entries_treePolicy;
  "entries/versioning": typeof entries_versioning;
  "entries/workflow/assetRefs": typeof entries_workflow_assetRefs;
  "entries/workflow/commands": typeof entries_workflow_commands;
  "entries/workflow/draftCommands": typeof entries_workflow_draftCommands;
  "entries/workflow/draftPlacement": typeof entries_workflow_draftPlacement;
  "entries/workflow/draftSearch": typeof entries_workflow_draftSearch;
  "entries/workflow/drafts": typeof entries_workflow_drafts;
  "entries/workflow/duplicateEntry": typeof entries_workflow_duplicateEntry;
  "entries/workflow/hashing": typeof entries_workflow_hashing;
  "entries/workflow/historyCommands": typeof entries_workflow_historyCommands;
  "entries/workflow/historyPlacement": typeof entries_workflow_historyPlacement;
  "entries/workflow/lifecycleCommands": typeof entries_workflow_lifecycleCommands;
  "entries/workflow/path": typeof entries_workflow_path;
  "entries/workflow/projection": typeof entries_workflow_projection;
  "entries/workflow/projectionBuild": typeof entries_workflow_projectionBuild;
  "entries/workflow/publicTree": typeof entries_workflow_publicTree;
  "entries/workflow/publicTree/model": typeof entries_workflow_publicTree_model;
  "entries/workflow/publicTree/pathBatch": typeof entries_workflow_publicTree_pathBatch;
  "entries/workflow/publicTree/pathResolution": typeof entries_workflow_publicTree_pathResolution;
  "entries/workflow/publicTree/placement": typeof entries_workflow_publicTree_placement;
  "entries/workflow/publicTree/redirectPlacement": typeof entries_workflow_publicTree_redirectPlacement;
  "entries/workflow/publicTree/redirects": typeof entries_workflow_publicTree_redirects;
  "entries/workflow/publicationCommands": typeof entries_workflow_publicationCommands;
  "entries/workflow/publishImpact": typeof entries_workflow_publishImpact;
  "entries/workflow/renderSafety": typeof entries_workflow_renderSafety;
  "entries/workflow/revisions": typeof entries_workflow_revisions;
  "entries/workflow/routeGeneration": typeof entries_workflow_routeGeneration;
  "entries/workflow/subtreeRoutes": typeof entries_workflow_subtreeRoutes;
  errors: typeof errors;
  functions: typeof functions;
  lib: typeof lib;
  "lib/activity": typeof lib_activity;
  "lib/collections": typeof lib_collections;
  "lib/contentLimits": typeof lib_contentLimits;
  "lib/data": typeof lib_data;
  "lib/fields": typeof lib_fields;
  "lib/ids": typeof lib_ids;
  "lib/installedContract": typeof lib_installedContract;
  "lib/locale": typeof lib_locale;
  "lib/ordering": typeof lib_ordering;
  "lib/paths": typeof lib_paths;
  "lib/publicData": typeof lib_publicData;
  "lib/revalidationOutbox": typeof lib_revalidationOutbox;
  "lib/sanitize": typeof lib_sanitize;
  "lib/search": typeof lib_search;
  "lib/treeOrder": typeof lib_treeOrder;
  "lib/types": typeof lib_types;
  "lib/utils": typeof lib_utils;
  "lib/validation": typeof lib_validation;
  liveFixtures: typeof liveFixtures;
  "liveFixtures/cleanup": typeof liveFixtures_cleanup;
  "liveFixtures/finalize": typeof liveFixtures_finalize;
  mcpAuthLimiter: typeof mcpAuthLimiter;
  mcpCredentials: typeof mcpCredentials;
  mcpHandler: typeof mcpHandler;
  members: typeof members;
  "members/invitations": typeof members_invitations;
  operationHash: typeof operationHash;
  operationHelpers: typeof operationHelpers;
  operations: typeof operations;
  portability: typeof portability;
  "portability/assets": typeof portability_assets;
  "portability/durableHash": typeof portability_durableHash;
  "portability/exportCleanup": typeof portability_exportCleanup;
  "portability/exportModel": typeof portability_exportModel;
  "portability/exportPreflight": typeof portability_exportPreflight;
  "portability/exports": typeof portability_exports;
  "portability/importLifecycle": typeof portability_importLifecycle;
  "portability/importModel": typeof portability_importModel;
  "portability/importPlanning": typeof portability_importPlanning;
  "portability/importWorker": typeof portability_importWorker;
  "portability/items": typeof portability_items;
  "portability/lease": typeof portability_lease;
  "portability/model": typeof portability_model;
  "portability/placement": typeof portability_placement;
  "portability/portableJson": typeof portability_portableJson;
  "portability/runStatus": typeof portability_runStatus;
  "portability/runs": typeof portability_runs;
  "portability/worker": typeof portability_worker;
  public: typeof public_;
  publicAssets: typeof publicAssets;
  publicPagination: typeof publicPagination;
  publicProjectionReads: typeof publicProjectionReads;
  publicReadAdapter: typeof publicReadAdapter;
  "publicReads/discoveryHandlers": typeof publicReads_discoveryHandlers;
  "publicReads/entries": typeof publicReads_entries;
  "publicReads/navigationHandlers": typeof publicReads_navigationHandlers;
  "publicReads/pageHandlers": typeof publicReads_pageHandlers;
  "publicReads/siteHandlers": typeof publicReads_siteHandlers;
  "publicReads/validation": typeof publicReads_validation;
  redirects: typeof redirects;
  "redirects/inventory": typeof redirects_inventory;
  revalidation: typeof revalidation;
  "revalidation/diagnostics": typeof revalidation_diagnostics;
  "revalidation/retryOperation": typeof revalidation_retryOperation;
  "revalidation/targets": typeof revalidation_targets;
  "revalidation/worker": typeof revalidation_worker;
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
