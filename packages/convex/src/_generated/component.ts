/* eslint-disable */
/**
 * Generated `ComponentApi` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";

/**
 * A utility for referencing a Convex component's exposed API.
 *
 * Useful when expecting a parameter like `components.myComponent`.
 * Usage:
 * ```ts
 * async function myFunction(ctx: QueryCtx, component: ComponentApi) {
 *   return ctx.runQuery(component.someFile.someQuery, { ...args });
 * }
 * ```
 */
export type ComponentApi<Name extends string | undefined = string | undefined> =
  {
    agentRuns: {
      completeRun: FunctionReference<
        "mutation",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          _trustedCaller?:
            | { kind: "anonymous"; subject: "system:anonymous" }
            | {
                email?: string;
                emailVerified?: boolean;
                kind: "user";
                name?: string;
                subject: string;
                userId: string;
              }
            | {
                clientId: string;
                issuer: string;
                kind: "mcp";
                scopes: Array<string>;
                subject: string;
                userId: string;
              }
            | { deployId: string; kind: "deploy"; subject: string };
          agentRunId: string;
        },
        {
          _id: string;
          createdAt: number;
          createdBy: string;
          delegatedUserId: string;
          endedAt: number | null;
          expiresAt: number | null;
          lastError: string | null;
          lastWriteAt: number | null;
          oauthClientId: string;
          oauthDelegationId: string;
          scopeSnapshot: Array<string>;
          status: "active" | "completed" | "revoked" | "failed";
          taskName: string;
          updatedAt: number;
        },
        Name
      >;
      listRuns: FunctionReference<
        "query",
        "internal",
        {
          _trustedCaller?:
            | { kind: "anonymous"; subject: "system:anonymous" }
            | {
                email?: string;
                emailVerified?: boolean;
                kind: "user";
                name?: string;
                subject: string;
                userId: string;
              }
            | {
                clientId: string;
                issuer: string;
                kind: "mcp";
                scopes: Array<string>;
                subject: string;
                userId: string;
              }
            | { deployId: string; kind: "deploy"; subject: string };
          limit?: number;
        },
        Array<{
          _id: string;
          createdAt: number;
          createdBy: string;
          delegatedUserId: string;
          endedAt: number | null;
          expiresAt: number | null;
          lastError: string | null;
          lastWriteAt: number | null;
          oauthClientId: string;
          oauthDelegationId: string;
          scopeSnapshot: Array<string>;
          status: "active" | "completed" | "revoked" | "failed";
          taskName: string;
          updatedAt: number;
        }>,
        Name
      >;
      revokeRun: FunctionReference<
        "mutation",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          agentRunId: string;
        },
        {
          _id: string;
          createdAt: number;
          createdBy: string;
          delegatedUserId: string;
          endedAt: number | null;
          expiresAt: number | null;
          lastError: string | null;
          lastWriteAt: number | null;
          oauthClientId: string;
          oauthDelegationId: string;
          scopeSnapshot: Array<string>;
          status: "active" | "completed" | "revoked" | "failed";
          taskName: string;
          updatedAt: number;
        },
        Name
      >;
      startRun: FunctionReference<
        "mutation",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          _trustedCaller?:
            | { kind: "anonymous"; subject: "system:anonymous" }
            | {
                email?: string;
                emailVerified?: boolean;
                kind: "user";
                name?: string;
                subject: string;
                userId: string;
              }
            | {
                clientId: string;
                issuer: string;
                kind: "mcp";
                scopes: Array<string>;
                subject: string;
                userId: string;
              }
            | { deployId: string; kind: "deploy"; subject: string };
          expiresAt?: number | null;
          taskName: string;
        },
        {
          _id: string;
          createdAt: number;
          createdBy: string;
          delegatedUserId: string;
          endedAt: number | null;
          expiresAt: number | null;
          lastError: string | null;
          lastWriteAt: number | null;
          oauthClientId: string;
          oauthDelegationId: string;
          scopeSnapshot: Array<string>;
          status: "active" | "completed" | "revoked" | "failed";
          taskName: string;
          updatedAt: number;
        },
        Name
      >;
    };
    assetRecovery: {
      createAssetRecoveryArtifact: FunctionReference<
        "action",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          _trustedCaller?:
            | { kind: "anonymous"; subject: "system:anonymous" }
            | {
                email?: string;
                emailVerified?: boolean;
                kind: "user";
                name?: string;
                subject: string;
                userId: string;
              }
            | {
                clientId: string;
                issuer: string;
                kind: "mcp";
                scopes: Array<string>;
                subject: string;
                userId: string;
              }
            | { deployId: string; kind: "deploy"; subject: string };
          assetId: string;
        },
        {
          artifactId: string;
          assetId: string;
          checksum: string;
          storageRef: string;
        },
        Name
      >;
      deleteAssetRecoveryArtifactOperationExecute: FunctionReference<
        "mutation",
        "internal",
        {
          _confirmationToken?: string;
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          artifactId: string;
        },
        | { status: "applied"; value: null }
        | { code: string; details: any; message: string; status: "blocked" }
        | { code: string; details: any; message: string; status: "stale" },
        Name
      >;
      downloadAssetRecoveryArtifact: FunctionReference<
        "action",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          _trustedCaller?:
            | { kind: "anonymous"; subject: "system:anonymous" }
            | {
                email?: string;
                emailVerified?: boolean;
                kind: "user";
                name?: string;
                subject: string;
                userId: string;
              }
            | {
                clientId: string;
                issuer: string;
                kind: "mcp";
                scopes: Array<string>;
                subject: string;
                userId: string;
              }
            | { deployId: string; kind: "deploy"; subject: string };
          artifactId: string;
        },
        { archiveJson: string; artifactId: string; checksum: string },
        Name
      >;
      previewDeleteAssetRecoveryArtifactOperation: FunctionReference<
        "mutation",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          artifactId: string;
        },
        {
          allowed: boolean;
          blockers: Array<{
            code: string;
            count?: number;
            details?: any;
            message: string;
            status?: "blocked" | "stale";
          }>;
          confirm: any;
          confirmation: { expiresAt: number; token: string } | null;
          details: any;
          effects: Array<{
            count?: number | null;
            countLabel?: string;
            kind: string;
            minimumCount?: number;
            summary: string;
          }>;
          summary: string;
          version: any;
          warnings: Array<{
            code: string;
            count?: number;
            details?: any;
            message: string;
            status?: "blocked" | "stale";
          }>;
        },
        Name
      >;
      previewRestoreAsset: FunctionReference<
        "action",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          _trustedCaller?:
            | { kind: "anonymous"; subject: "system:anonymous" }
            | {
                email?: string;
                emailVerified?: boolean;
                kind: "user";
                name?: string;
                subject: string;
                userId: string;
              }
            | {
                clientId: string;
                issuer: string;
                kind: "mcp";
                scopes: Array<string>;
                subject: string;
                userId: string;
              }
            | { deployId: string; kind: "deploy"; subject: string };
          artifactId: string;
        },
        {
          applySupported: boolean;
          artifactId: string;
          blockers: Array<{ code: string; message: string }>;
          checksum: string;
          warnings: Array<{ code: string; message: string }>;
        },
        Name
      >;
      restoreAsset: FunctionReference<
        "action",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          _trustedCaller?:
            | { kind: "anonymous"; subject: "system:anonymous" }
            | {
                email?: string;
                emailVerified?: boolean;
                kind: "user";
                name?: string;
                subject: string;
                userId: string;
              }
            | {
                clientId: string;
                issuer: string;
                kind: "mcp";
                scopes: Array<string>;
                subject: string;
                userId: string;
              }
            | { deployId: string; kind: "deploy"; subject: string };
          artifactId: string;
          expectedChecksum: string;
        },
        {
          artifactId: string;
          originalAssetId: string;
          restoredAssetId: string;
        },
        Name
      >;
      verifyAssetRecoveryArtifact: FunctionReference<
        "action",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          _trustedCaller?:
            | { kind: "anonymous"; subject: "system:anonymous" }
            | {
                email?: string;
                emailVerified?: boolean;
                kind: "user";
                name?: string;
                subject: string;
                userId: string;
              }
            | {
                clientId: string;
                issuer: string;
                kind: "mcp";
                scopes: Array<string>;
                subject: string;
                userId: string;
              }
            | { deployId: string; kind: "deploy"; subject: string };
          artifactId: string;
        },
        {
          artifactId: string;
          checksumMatches: boolean;
          currentDataMatches: boolean;
          ok: boolean;
        },
        Name
      >;
    };
    assets: {
      claimAssetUploadSession: FunctionReference<
        "mutation",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          _trustedCaller?:
            | { kind: "anonymous"; subject: "system:anonymous" }
            | {
                email?: string;
                emailVerified?: boolean;
                kind: "user";
                name?: string;
                subject: string;
                userId: string;
              }
            | {
                clientId: string;
                issuer: string;
                kind: "mcp";
                scopes: Array<string>;
                subject: string;
                userId: string;
              }
            | { deployId: string; kind: "deploy"; subject: string };
          sessionId: string;
          storageId: string;
          token: string;
        },
        { expiresAt: number; generation: number; sessionId: string },
        Name
      >;
      createAssetUploadSession: FunctionReference<
        "mutation",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          _trustedCaller?:
            | { kind: "anonymous"; subject: "system:anonymous" }
            | {
                email?: string;
                emailVerified?: boolean;
                kind: "user";
                name?: string;
                subject: string;
                userId: string;
              }
            | {
                clientId: string;
                issuer: string;
                kind: "mcp";
                scopes: Array<string>;
                subject: string;
                userId: string;
              }
            | { deployId: string; kind: "deploy"; subject: string };
        },
        {
          expiresAt: number;
          sessionId: string;
          token: string;
          uploadUrl: string;
        },
        Name
      >;
      deleteAssetOperationExecute: FunctionReference<
        "mutation",
        "internal",
        {
          _confirmationToken?: string;
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          _trustedCaller?:
            | { kind: "anonymous"; subject: "system:anonymous" }
            | {
                email?: string;
                emailVerified?: boolean;
                kind: "user";
                name?: string;
                subject: string;
                userId: string;
              }
            | {
                clientId: string;
                issuer: string;
                kind: "mcp";
                scopes: Array<string>;
                subject: string;
                userId: string;
              }
            | { deployId: string; kind: "deploy"; subject: string };
          assetId: string;
          force?: boolean;
        },
        | { status: "applied"; value: null }
        | { code: string; details: any; message: string; status: "blocked" }
        | { code: string; details: any; message: string; status: "stale" },
        Name
      >;
      finalizeAssetUploadSession: FunctionReference<
        "action",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          _trustedCaller?:
            | { kind: "anonymous"; subject: "system:anonymous" }
            | {
                email?: string;
                emailVerified?: boolean;
                kind: "user";
                name?: string;
                subject: string;
                userId: string;
              }
            | {
                clientId: string;
                issuer: string;
                kind: "mcp";
                scopes: Array<string>;
                subject: string;
                userId: string;
              }
            | { deployId: string; kind: "deploy"; subject: string };
          alt?: string | Record<string, string>;
          caption?: string | Record<string, string>;
          collection?: string;
          entryId?: string;
          filename: string;
          scope: "global" | "collection" | "entry";
          sessionId: string;
          token: string;
        },
        string,
        Name
      >;
      getAsset: FunctionReference<
        "query",
        "internal",
        {
          _trustedCaller?:
            | { kind: "anonymous"; subject: "system:anonymous" }
            | {
                email?: string;
                emailVerified?: boolean;
                kind: "user";
                name?: string;
                subject: string;
                userId: string;
              }
            | {
                clientId: string;
                issuer: string;
                kind: "mcp";
                scopes: Array<string>;
                subject: string;
                userId: string;
              }
            | { deployId: string; kind: "deploy"; subject: string };
          assetId: string;
        },
        {
          alt: string | Record<string, string> | null;
          caption: string | Record<string, string> | null;
          collection: string | null;
          collectionLabel: string | null;
          createdAt: number;
          deletedAt: number | null;
          entryId: string | null;
          entryTitle: string | null;
          filename: string;
          height: number | null;
          id: string;
          mimeType: string;
          ownerPath: Array<string>;
          referenceCertainty: {
            canonicalGeneration: number;
            proofCurrent: boolean;
            state: "used" | "unused-verified" | "unknown-stale";
            verifiedAt: number | null;
            verifiedRunId: string | null;
          };
          scope: "global" | "collection" | "entry";
          size: number;
          tags: Array<string>;
          thumbnailUrl: string | null;
          updatedAt: number | null;
          url: string | null;
          width: number | null;
        } | null,
        Name
      >;
      getAssetDeliveryDescriptor: FunctionReference<
        "query",
        "internal",
        {
          _trustedCaller?:
            | { kind: "anonymous"; subject: "system:anonymous" }
            | {
                email?: string;
                emailVerified?: boolean;
                kind: "user";
                name?: string;
                subject: string;
                userId: string;
              }
            | {
                clientId: string;
                issuer: string;
                kind: "mcp";
                scopes: Array<string>;
                subject: string;
                userId: string;
              }
            | { deployId: string; kind: "deploy"; subject: string };
          assetId: string;
        },
        null | { bytes: number; mimeType: string; sha256: string; url: string },
        Name
      >;
      getAssetManagerData: FunctionReference<
        "query",
        "internal",
        {
          collection?: string;
          deleted?: "active" | "trashed" | "all";
          entryId?: string;
          kind?: "all" | "image" | "document";
          location?: "all" | "global" | "collection" | "entry" | "accessible";
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
          search?: string;
          size?: "any" | "small" | "medium" | "large";
          sort?: "name" | "date" | "size" | "kind";
          tag?: string;
          time?: "any" | "24h" | "7d" | "30d" | "90d";
          usage?: "all" | "used" | "unused-verified" | "unknown-stale";
        },
        {
          continueCursor: string;
          facets: {
            activeCount: number;
            collections: Array<{ count: number; key: string; label: string }>;
            globalActiveCount: number;
            tags: Array<{ count: number; key: string }>;
            trashedCount: number;
          };
          isDone: boolean;
          page: Array<{
            alt: string | Record<string, string> | null;
            caption: string | Record<string, string> | null;
            collection: string | null;
            collectionLabel: string | null;
            createdAt: number;
            deletedAt: number | null;
            entryId: string | null;
            entryTitle: string | null;
            filename: string;
            height: number | null;
            id: string;
            mimeType: string;
            ownerPath: Array<string>;
            referenceCertainty: {
              canonicalGeneration: number;
              proofCurrent: boolean;
              state: "used" | "unused-verified" | "unknown-stale";
              verifiedAt: number | null;
              verifiedRunId: string | null;
            };
            scope: "global" | "collection" | "entry";
            size: number;
            tags: Array<string>;
            thumbnailUrl: string | null;
            updatedAt: number | null;
            url: string | null;
            width: number | null;
          }>;
        },
        Name
      >;
      getAssetManagerFacets: FunctionReference<
        "query",
        "internal",
        {},
        {
          activeCount: number;
          collections: Array<{ count: number; key: string; label: string }>;
          globalActiveCount: number;
          tags: Array<{ count: number; key: string }>;
          trashedCount: number;
        },
        Name
      >;
      listAssetsByOwner: FunctionReference<
        "query",
        "internal",
        {
          collection?: string;
          entryId?: string;
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
          scope: "global" | "collection" | "entry";
        },
        {
          continueCursor: string;
          isDone: boolean;
          page: Array<{
            alt: string | Record<string, string> | null;
            caption: string | Record<string, string> | null;
            collection: string | null;
            collectionLabel: string | null;
            createdAt: number;
            deletedAt: number | null;
            entryId: string | null;
            entryTitle: string | null;
            filename: string;
            height: number | null;
            id: string;
            mimeType: string;
            ownerPath: Array<string>;
            referenceCertainty: {
              canonicalGeneration: number;
              proofCurrent: boolean;
              state: "used" | "unused-verified" | "unknown-stale";
              verifiedAt: number | null;
              verifiedRunId: string | null;
            };
            scope: "global" | "collection" | "entry";
            size: number;
            tags: Array<string>;
            thumbnailUrl: string | null;
            updatedAt: number | null;
            url: string | null;
            width: number | null;
          }>;
        },
        Name
      >;
      listAssetUsages: FunctionReference<
        "query",
        "internal",
        {
          assetId: string;
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
        },
        {
          continueCursor: string;
          isDone: boolean;
          page: Array<{
            collection: string;
            collectionLabel: string;
            entryId: string;
            entryTitle: string;
            fieldPath: string;
            locale: string;
            sourceId: string;
            sourceKind: "draft" | "revision" | "public";
          }>;
        },
        Name
      >;
      listTerminalAssetCleanupTasks: FunctionReference<
        "query",
        "internal",
        {
          paginationOpts?: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
        },
        {
          continueCursor: string;
          isDone: boolean;
          page: Array<{
            attempts: number;
            createdAt: number;
            generation: number;
            lastError: string | null;
            storageId: string;
            taskId: string;
            updatedAt: number;
            uploadSessionId: string | null;
          }>;
        },
        Name
      >;
      moveAsset: FunctionReference<
        "mutation",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          _trustedCaller?:
            | { kind: "anonymous"; subject: "system:anonymous" }
            | {
                email?: string;
                emailVerified?: boolean;
                kind: "user";
                name?: string;
                subject: string;
                userId: string;
              }
            | {
                clientId: string;
                issuer: string;
                kind: "mcp";
                scopes: Array<string>;
                subject: string;
                userId: string;
              }
            | { deployId: string; kind: "deploy"; subject: string };
          assetId: string;
          collection?: string;
          entryId?: string;
          scope: "global" | "collection" | "entry";
        },
        null,
        Name
      >;
      previewDeleteAssetOperation: FunctionReference<
        "mutation",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          _trustedCaller?:
            | { kind: "anonymous"; subject: "system:anonymous" }
            | {
                email?: string;
                emailVerified?: boolean;
                kind: "user";
                name?: string;
                subject: string;
                userId: string;
              }
            | {
                clientId: string;
                issuer: string;
                kind: "mcp";
                scopes: Array<string>;
                subject: string;
                userId: string;
              }
            | { deployId: string; kind: "deploy"; subject: string };
          assetId: string;
          force?: boolean;
        },
        {
          allowed: boolean;
          blockers: Array<{
            code: string;
            count?: number;
            details?: any;
            message: string;
            status?: "blocked" | "stale";
          }>;
          confirm: any;
          confirmation: { expiresAt: number; token: string } | null;
          details: any;
          effects: Array<{
            count?: number | null;
            countLabel?: string;
            kind: string;
            minimumCount?: number;
            summary: string;
          }>;
          summary: string;
          version: any;
          warnings: Array<{
            code: string;
            count?: number;
            details?: any;
            message: string;
            status?: "blocked" | "stale";
          }>;
        },
        Name
      >;
      previewPurgeAssetOperation: FunctionReference<
        "mutation",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          _trustedCaller?:
            | { kind: "anonymous"; subject: "system:anonymous" }
            | {
                email?: string;
                emailVerified?: boolean;
                kind: "user";
                name?: string;
                subject: string;
                userId: string;
              }
            | {
                clientId: string;
                issuer: string;
                kind: "mcp";
                scopes: Array<string>;
                subject: string;
                userId: string;
              }
            | { deployId: string; kind: "deploy"; subject: string };
          assetId: string;
          recoveryArtifactId: string;
        },
        {
          allowed: boolean;
          blockers: Array<{
            code: string;
            count?: number;
            details?: any;
            message: string;
            status?: "blocked" | "stale";
          }>;
          confirm: any;
          confirmation: { expiresAt: number; token: string } | null;
          details: any;
          effects: Array<{
            count?: number | null;
            countLabel?: string;
            kind: string;
            minimumCount?: number;
            summary: string;
          }>;
          summary: string;
          version: any;
          warnings: Array<{
            code: string;
            count?: number;
            details?: any;
            message: string;
            status?: "blocked" | "stale";
          }>;
        },
        Name
      >;
      previewReplaceAssetOperation: FunctionReference<
        "mutation",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          _trustedCaller?:
            | { kind: "anonymous"; subject: "system:anonymous" }
            | {
                email?: string;
                emailVerified?: boolean;
                kind: "user";
                name?: string;
                subject: string;
                userId: string;
              }
            | {
                clientId: string;
                issuer: string;
                kind: "mcp";
                scopes: Array<string>;
                subject: string;
                userId: string;
              }
            | { deployId: string; kind: "deploy"; subject: string };
          assetId: string;
          sessionId: string;
        },
        {
          allowed: boolean;
          blockers: Array<{
            code: string;
            count?: number;
            details?: any;
            message: string;
            status?: "blocked" | "stale";
          }>;
          confirm: any;
          confirmation: { expiresAt: number; token: string } | null;
          details: any;
          effects: Array<{
            count?: number | null;
            countLabel?: string;
            kind: string;
            minimumCount?: number;
            summary: string;
          }>;
          summary: string;
          version: any;
          warnings: Array<{
            code: string;
            count?: number;
            details?: any;
            message: string;
            status?: "blocked" | "stale";
          }>;
        },
        Name
      >;
      previewRetryAssetCleanupOperation: FunctionReference<
        "mutation",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          expectedGeneration: number;
          taskId: string;
        },
        {
          allowed: boolean;
          blockers: Array<{
            code: string;
            count?: number;
            details?: any;
            message: string;
            status?: "blocked" | "stale";
          }>;
          confirm: any;
          confirmation: { expiresAt: number; token: string } | null;
          details: any;
          effects: Array<{
            count?: number | null;
            countLabel?: string;
            kind: string;
            minimumCount?: number;
            summary: string;
          }>;
          summary: string;
          version: any;
          warnings: Array<{
            code: string;
            count?: number;
            details?: any;
            message: string;
            status?: "blocked" | "stale";
          }>;
        },
        Name
      >;
      purgeAsset: FunctionReference<
        "action",
        "internal",
        {
          _confirmationToken?: string;
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          _trustedCaller?:
            | { kind: "anonymous"; subject: "system:anonymous" }
            | {
                email?: string;
                emailVerified?: boolean;
                kind: "user";
                name?: string;
                subject: string;
                userId: string;
              }
            | {
                clientId: string;
                issuer: string;
                kind: "mcp";
                scopes: Array<string>;
                subject: string;
                userId: string;
              }
            | { deployId: string; kind: "deploy"; subject: string };
          assetId: string;
          recoveryArtifactId: string;
        },
        | { status: "applied"; value: null }
        | { code: string; details: any; message: string; status: "blocked" }
        | { code: string; details: any; message: string; status: "stale" },
        Name
      >;
      replaceAsset: FunctionReference<
        "action",
        "internal",
        {
          _confirmationToken?: string;
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          _trustedCaller?:
            | { kind: "anonymous"; subject: "system:anonymous" }
            | {
                email?: string;
                emailVerified?: boolean;
                kind: "user";
                name?: string;
                subject: string;
                userId: string;
              }
            | {
                clientId: string;
                issuer: string;
                kind: "mcp";
                scopes: Array<string>;
                subject: string;
                userId: string;
              }
            | { deployId: string; kind: "deploy"; subject: string };
          assetId: string;
          sessionId: string;
        },
        | {
            status: "applied";
            value: {
              assetId: string;
              publicEntriesUpdated: number;
              recoveryArtifactId: string;
              revalidationQueued: boolean;
            };
          }
        | { code: string; details: any; message: string; status: "blocked" }
        | { code: string; details: any; message: string; status: "stale" },
        Name
      >;
      resolveAssetUrls: FunctionReference<
        "query",
        "internal",
        {
          _trustedCaller?:
            | { kind: "anonymous"; subject: "system:anonymous" }
            | {
                email?: string;
                emailVerified?: boolean;
                kind: "user";
                name?: string;
                subject: string;
                userId: string;
              }
            | {
                clientId: string;
                issuer: string;
                kind: "mcp";
                scopes: Array<string>;
                subject: string;
                userId: string;
              }
            | { deployId: string; kind: "deploy"; subject: string };
          assetIds: Array<string>;
        },
        Record<string, string | null>,
        Name
      >;
      restoreAsset: FunctionReference<
        "mutation",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          _trustedCaller?:
            | { kind: "anonymous"; subject: "system:anonymous" }
            | {
                email?: string;
                emailVerified?: boolean;
                kind: "user";
                name?: string;
                subject: string;
                userId: string;
              }
            | {
                clientId: string;
                issuer: string;
                kind: "mcp";
                scopes: Array<string>;
                subject: string;
                userId: string;
              }
            | { deployId: string; kind: "deploy"; subject: string };
          assetId: string;
        },
        null,
        Name
      >;
      retryAssetCleanupOperationExecute: FunctionReference<
        "mutation",
        "internal",
        {
          _confirmationToken?: string;
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          expectedGeneration: number;
          taskId: string;
        },
        | { status: "applied"; value: { generation: number; taskId: string } }
        | { code: string; details: any; message: string; status: "blocked" }
        | { code: string; details: any; message: string; status: "stale" },
        Name
      >;
      updateAsset: FunctionReference<
        "mutation",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          _trustedCaller?:
            | { kind: "anonymous"; subject: "system:anonymous" }
            | {
                email?: string;
                emailVerified?: boolean;
                kind: "user";
                name?: string;
                subject: string;
                userId: string;
              }
            | {
                clientId: string;
                issuer: string;
                kind: "mcp";
                scopes: Array<string>;
                subject: string;
                userId: string;
              }
            | { deployId: string; kind: "deploy"; subject: string };
          alt?: string | Record<string, string>;
          assetId: string;
          caption?: string | Record<string, string>;
          filename?: string;
          tags?: Array<string>;
        },
        null,
        Name
      >;
      verifyAssetReplacementUpload: FunctionReference<
        "action",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          _trustedCaller?:
            | { kind: "anonymous"; subject: "system:anonymous" }
            | {
                email?: string;
                emailVerified?: boolean;
                kind: "user";
                name?: string;
                subject: string;
                userId: string;
              }
            | {
                clientId: string;
                issuer: string;
                kind: "mcp";
                scopes: Array<string>;
                subject: string;
                userId: string;
              }
            | { deployId: string; kind: "deploy"; subject: string };
          assetId: string;
          filename: string;
          sessionId: string;
          token: string;
        },
        {
          assetId: string;
          expiresAt: number;
          filename: string;
          frames: number;
          generation: number;
          height: number;
          mimeType: "image/gif" | "image/jpeg" | "image/png" | "image/webp";
          recoveryArtifactId: string;
          sessionId: string;
          sha256: string;
          size: number;
          width: number;
        },
        Name
      >;
    };
    collections: {
      contracts: {
        getCollection: FunctionReference<
          "query",
          "internal",
          {
            _trustedCaller?:
              | { kind: "anonymous"; subject: "system:anonymous" }
              | {
                  email?: string;
                  emailVerified?: boolean;
                  kind: "user";
                  name?: string;
                  subject: string;
                  userId: string;
                }
              | {
                  clientId: string;
                  issuer: string;
                  kind: "mcp";
                  scopes: Array<string>;
                  subject: string;
                  userId: string;
                }
              | { deployId: string; kind: "deploy"; subject: string };
            slug: string;
          },
          null | {
            _id: string;
            contract?: { source: "code"; version: string };
            createdAt: number;
            fields: Array<{
              condition?: Record<
                string,
                _GinkoCmsJsonDepth8
              > | null;
              defaultValue?:
                _GinkoCmsJsonDepth8;
              description?: string | null;
              fields?: Array<{
                condition?: Record<
                  string,
                  _GinkoCmsJsonDepth8
                > | null;
                defaultValue?:
                  _GinkoCmsJsonDepth8;
                description?: string | null;
                fields?: Array<{
                  condition?: Record<
                    string,
                    _GinkoCmsJsonDepth8
                  > | null;
                  defaultValue?:
                    _GinkoCmsJsonDepth8;
                  description?: string | null;
                  fields?: Array<{
                    condition?: Record<
                      string,
                      _GinkoCmsJsonDepth8
                    > | null;
                    defaultValue?:
                      _GinkoCmsJsonDepth8;
                    description?: string | null;
                    fields?: Array<{
                      condition?: Record<
                        string,
                        _GinkoCmsJsonDepth8
                      > | null;
                      defaultValue?:
                        _GinkoCmsJsonDepth8;
                      description?: string | null;
                      fields?: Array<{
                        condition?: Record<
                          string,
                          _GinkoCmsJsonDepth8
                        > | null;
                        defaultValue?:
                          _GinkoCmsJsonDepth8;
                        description?: string | null;
                        fields?: Array<{
                          condition?: Record<
                            string,
                            _GinkoCmsJsonDepth8
                          > | null;
                          defaultValue?:
                            _GinkoCmsJsonDepth8;
                          description?: string | null;
                          fields?: Array<{
                            condition?: Record<
                              string,
                              _GinkoCmsJsonDepth8
                            > | null;
                            defaultValue?:
                              _GinkoCmsJsonDepth8;
                            description?: string | null;
                            fields?: Array<{
                              condition?: Record<
                                string,
                                _GinkoCmsJsonDepth8
                              > | null;
                              defaultValue?:
                                _GinkoCmsJsonDepth8;
                              description?: string | null;
                              fields?: null;
                              hidden?: boolean;
                              key: string;
                              label?: string | Record<string, string> | null;
                              language?: string | null;
                              localized?: boolean;
                              max?: number | null;
                              media?: {
                                accept?: Array<string>;
                                aspectRatio?: string | null;
                              } | null;
                              min?: number | null;
                              options?: Array<string> | null;
                              order?: number;
                              relation?: {
                                collection: string;
                                multiple?: boolean;
                              } | null;
                              required?: boolean;
                              searchable?: boolean;
                              slugFrom?: string | null;
                              sortable?: boolean;
                              step?: number | null;
                              type:
                                | "text"
                                | "textarea"
                                | "richtext"
                                | "slug"
                                | "email"
                                | "url"
                                | "number"
                                | "range"
                                | "select"
                                | "multiselect"
                                | "radio"
                                | "checkbox"
                                | "toggle"
                                | "date"
                                | "datetime"
                                | "time"
                                | "json"
                                | "object"
                                | "array"
                                | "blocks"
                                | "relation"
                                | "relations"
                                | "image"
                                | "images"
                                | "file"
                                | "icon"
                                | "code"
                                | "color"
                                | "divider"
                                | "section";
                              validation?: Record<
                                string,
                                _GinkoCmsJsonDepth8
                              > | null;
                              width?: "full" | "half";
                            }> | null;
                            hidden?: boolean;
                            key: string;
                            label?: string | Record<string, string> | null;
                            language?: string | null;
                            localized?: boolean;
                            max?: number | null;
                            media?: {
                              accept?: Array<string>;
                              aspectRatio?: string | null;
                            } | null;
                            min?: number | null;
                            options?: Array<string> | null;
                            order?: number;
                            relation?: {
                              collection: string;
                              multiple?: boolean;
                            } | null;
                            required?: boolean;
                            searchable?: boolean;
                            slugFrom?: string | null;
                            sortable?: boolean;
                            step?: number | null;
                            type:
                              | "text"
                              | "textarea"
                              | "richtext"
                              | "slug"
                              | "email"
                              | "url"
                              | "number"
                              | "range"
                              | "select"
                              | "multiselect"
                              | "radio"
                              | "checkbox"
                              | "toggle"
                              | "date"
                              | "datetime"
                              | "time"
                              | "json"
                              | "object"
                              | "array"
                              | "blocks"
                              | "relation"
                              | "relations"
                              | "image"
                              | "images"
                              | "file"
                              | "icon"
                              | "code"
                              | "color"
                              | "divider"
                              | "section";
                            validation?: Record<
                              string,
                              _GinkoCmsJsonDepth8
                            > | null;
                            width?: "full" | "half";
                          }> | null;
                          hidden?: boolean;
                          key: string;
                          label?: string | Record<string, string> | null;
                          language?: string | null;
                          localized?: boolean;
                          max?: number | null;
                          media?: {
                            accept?: Array<string>;
                            aspectRatio?: string | null;
                          } | null;
                          min?: number | null;
                          options?: Array<string> | null;
                          order?: number;
                          relation?: {
                            collection: string;
                            multiple?: boolean;
                          } | null;
                          required?: boolean;
                          searchable?: boolean;
                          slugFrom?: string | null;
                          sortable?: boolean;
                          step?: number | null;
                          type:
                            | "text"
                            | "textarea"
                            | "richtext"
                            | "slug"
                            | "email"
                            | "url"
                            | "number"
                            | "range"
                            | "select"
                            | "multiselect"
                            | "radio"
                            | "checkbox"
                            | "toggle"
                            | "date"
                            | "datetime"
                            | "time"
                            | "json"
                            | "object"
                            | "array"
                            | "blocks"
                            | "relation"
                            | "relations"
                            | "image"
                            | "images"
                            | "file"
                            | "icon"
                            | "code"
                            | "color"
                            | "divider"
                            | "section";
                          validation?: Record<
                            string,
                            _GinkoCmsJsonDepth8
                          > | null;
                          width?: "full" | "half";
                        }> | null;
                        hidden?: boolean;
                        key: string;
                        label?: string | Record<string, string> | null;
                        language?: string | null;
                        localized?: boolean;
                        max?: number | null;
                        media?: {
                          accept?: Array<string>;
                          aspectRatio?: string | null;
                        } | null;
                        min?: number | null;
                        options?: Array<string> | null;
                        order?: number;
                        relation?: {
                          collection: string;
                          multiple?: boolean;
                        } | null;
                        required?: boolean;
                        searchable?: boolean;
                        slugFrom?: string | null;
                        sortable?: boolean;
                        step?: number | null;
                        type:
                          | "text"
                          | "textarea"
                          | "richtext"
                          | "slug"
                          | "email"
                          | "url"
                          | "number"
                          | "range"
                          | "select"
                          | "multiselect"
                          | "radio"
                          | "checkbox"
                          | "toggle"
                          | "date"
                          | "datetime"
                          | "time"
                          | "json"
                          | "object"
                          | "array"
                          | "blocks"
                          | "relation"
                          | "relations"
                          | "image"
                          | "images"
                          | "file"
                          | "icon"
                          | "code"
                          | "color"
                          | "divider"
                          | "section";
                        validation?: Record<
                          string,
                          _GinkoCmsJsonDepth8
                        > | null;
                        width?: "full" | "half";
                      }> | null;
                      hidden?: boolean;
                      key: string;
                      label?: string | Record<string, string> | null;
                      language?: string | null;
                      localized?: boolean;
                      max?: number | null;
                      media?: {
                        accept?: Array<string>;
                        aspectRatio?: string | null;
                      } | null;
                      min?: number | null;
                      options?: Array<string> | null;
                      order?: number;
                      relation?: {
                        collection: string;
                        multiple?: boolean;
                      } | null;
                      required?: boolean;
                      searchable?: boolean;
                      slugFrom?: string | null;
                      sortable?: boolean;
                      step?: number | null;
                      type:
                        | "text"
                        | "textarea"
                        | "richtext"
                        | "slug"
                        | "email"
                        | "url"
                        | "number"
                        | "range"
                        | "select"
                        | "multiselect"
                        | "radio"
                        | "checkbox"
                        | "toggle"
                        | "date"
                        | "datetime"
                        | "time"
                        | "json"
                        | "object"
                        | "array"
                        | "blocks"
                        | "relation"
                        | "relations"
                        | "image"
                        | "images"
                        | "file"
                        | "icon"
                        | "code"
                        | "color"
                        | "divider"
                        | "section";
                      validation?: Record<
                        string,
                        _GinkoCmsJsonDepth8
                      > | null;
                      width?: "full" | "half";
                    }> | null;
                    hidden?: boolean;
                    key: string;
                    label?: string | Record<string, string> | null;
                    language?: string | null;
                    localized?: boolean;
                    max?: number | null;
                    media?: {
                      accept?: Array<string>;
                      aspectRatio?: string | null;
                    } | null;
                    min?: number | null;
                    options?: Array<string> | null;
                    order?: number;
                    relation?: {
                      collection: string;
                      multiple?: boolean;
                    } | null;
                    required?: boolean;
                    searchable?: boolean;
                    slugFrom?: string | null;
                    sortable?: boolean;
                    step?: number | null;
                    type:
                      | "text"
                      | "textarea"
                      | "richtext"
                      | "slug"
                      | "email"
                      | "url"
                      | "number"
                      | "range"
                      | "select"
                      | "multiselect"
                      | "radio"
                      | "checkbox"
                      | "toggle"
                      | "date"
                      | "datetime"
                      | "time"
                      | "json"
                      | "object"
                      | "array"
                      | "blocks"
                      | "relation"
                      | "relations"
                      | "image"
                      | "images"
                      | "file"
                      | "icon"
                      | "code"
                      | "color"
                      | "divider"
                      | "section";
                    validation?: Record<
                      string,
                      _GinkoCmsJsonDepth8
                    > | null;
                    width?: "full" | "half";
                  }> | null;
                  hidden?: boolean;
                  key: string;
                  label?: string | Record<string, string> | null;
                  language?: string | null;
                  localized?: boolean;
                  max?: number | null;
                  media?: {
                    accept?: Array<string>;
                    aspectRatio?: string | null;
                  } | null;
                  min?: number | null;
                  options?: Array<string> | null;
                  order?: number;
                  relation?: { collection: string; multiple?: boolean } | null;
                  required?: boolean;
                  searchable?: boolean;
                  slugFrom?: string | null;
                  sortable?: boolean;
                  step?: number | null;
                  type:
                    | "text"
                    | "textarea"
                    | "richtext"
                    | "slug"
                    | "email"
                    | "url"
                    | "number"
                    | "range"
                    | "select"
                    | "multiselect"
                    | "radio"
                    | "checkbox"
                    | "toggle"
                    | "date"
                    | "datetime"
                    | "time"
                    | "json"
                    | "object"
                    | "array"
                    | "blocks"
                    | "relation"
                    | "relations"
                    | "image"
                    | "images"
                    | "file"
                    | "icon"
                    | "code"
                    | "color"
                    | "divider"
                    | "section";
                  validation?: Record<
                    string,
                    _GinkoCmsJsonDepth8
                  > | null;
                  width?: "full" | "half";
                }> | null;
                hidden?: boolean;
                key: string;
                label?: string | Record<string, string> | null;
                language?: string | null;
                localized?: boolean;
                max?: number | null;
                media?: {
                  accept?: Array<string>;
                  aspectRatio?: string | null;
                } | null;
                min?: number | null;
                options?: Array<string> | null;
                order?: number;
                relation?: { collection: string; multiple?: boolean } | null;
                required?: boolean;
                searchable?: boolean;
                slugFrom?: string | null;
                sortable?: boolean;
                step?: number | null;
                type:
                  | "text"
                  | "textarea"
                  | "richtext"
                  | "slug"
                  | "email"
                  | "url"
                  | "number"
                  | "range"
                  | "select"
                  | "multiselect"
                  | "radio"
                  | "checkbox"
                  | "toggle"
                  | "date"
                  | "datetime"
                  | "time"
                  | "json"
                  | "object"
                  | "array"
                  | "blocks"
                  | "relation"
                  | "relations"
                  | "image"
                  | "images"
                  | "file"
                  | "icon"
                  | "code"
                  | "color"
                  | "divider"
                  | "section";
                validation?: Record<
                  string,
                  _GinkoCmsJsonDepth8
                > | null;
                width?: "full" | "half";
              }> | null;
              hidden?: boolean;
              key: string;
              label?: string | Record<string, string> | null;
              language?: string | null;
              localized?: boolean;
              max?: number | null;
              media?: {
                accept?: Array<string>;
                aspectRatio?: string | null;
              } | null;
              min?: number | null;
              options?: Array<string> | null;
              order?: number;
              relation?: { collection: string; multiple?: boolean } | null;
              required?: boolean;
              searchable?: boolean;
              slugFrom?: string | null;
              sortable?: boolean;
              step?: number | null;
              type:
                | "text"
                | "textarea"
                | "richtext"
                | "slug"
                | "email"
                | "url"
                | "number"
                | "range"
                | "select"
                | "multiselect"
                | "radio"
                | "checkbox"
                | "toggle"
                | "date"
                | "datetime"
                | "time"
                | "json"
                | "object"
                | "array"
                | "blocks"
                | "relation"
                | "relations"
                | "image"
                | "images"
                | "file"
                | "icon"
                | "code"
                | "color"
                | "divider"
                | "section";
              validation?: Record<
                string,
                _GinkoCmsJsonDepth8
              > | null;
              width?: "full" | "half";
            }>;
            icon: string | null;
            label: string;
            labelMap: string | Record<string, string>;
            locales: Array<string>;
            mode: "route" | "none";
            pathPrefix: string;
            rootSlug: string | null;
            routing: {
              mode?: "route" | "none";
              pathPrefix: string;
              rootSlug?: string | null;
              singleton?: boolean;
              slugMode?: "shared" | "localized" | "stable" | "localizedStable";
            };
            settings:
              _GinkoCmsJsonDepth8;
            singleton: boolean;
            slug: string;
            slugMode: "shared" | "localized" | "stable" | "localizedStable";
            type: "flat" | "tree";
            updatedAt: number;
            updatedBy: string;
          },
          Name
        >;
        listCollections: FunctionReference<
          "query",
          "internal",
          {
            _trustedCaller?:
              | { kind: "anonymous"; subject: "system:anonymous" }
              | {
                  email?: string;
                  emailVerified?: boolean;
                  kind: "user";
                  name?: string;
                  subject: string;
                  userId: string;
                }
              | {
                  clientId: string;
                  issuer: string;
                  kind: "mcp";
                  scopes: Array<string>;
                  subject: string;
                  userId: string;
                }
              | { deployId: string; kind: "deploy"; subject: string };
          },
          Array<{
            _id: string;
            createdAt: number;
            fieldCount: number;
            icon: string | null;
            label: string;
            labelMap: string | Record<string, string>;
            locales: Array<string>;
            mode: "route" | "none";
            pathPrefix: string;
            rootSlug: string | null;
            routing: {
              mode?: "route" | "none";
              pathPrefix: string;
              rootSlug?: string | null;
              singleton?: boolean;
              slugMode?: "shared" | "localized" | "stable" | "localizedStable";
            };
            singleton: boolean;
            slug: string;
            slugMode: "shared" | "localized" | "stable" | "localizedStable";
            type: "flat" | "tree";
            updatedAt: number;
            updatedBy: string;
          }>,
          Name
        >;
      };
      getCollection: FunctionReference<
        "query",
        "internal",
        {
          _trustedCaller?:
            | { kind: "anonymous"; subject: "system:anonymous" }
            | {
                email?: string;
                emailVerified?: boolean;
                kind: "user";
                name?: string;
                subject: string;
                userId: string;
              }
            | {
                clientId: string;
                issuer: string;
                kind: "mcp";
                scopes: Array<string>;
                subject: string;
                userId: string;
              }
            | { deployId: string; kind: "deploy"; subject: string };
          slug: string;
        },
        null | {
          _id: string;
          contract?: { source: "code"; version: string };
          createdAt: number;
          fields: Array<{
            condition?: Record<
              string,
              _GinkoCmsJsonDepth8
            > | null;
            defaultValue?:
              _GinkoCmsJsonDepth8;
            description?: string | null;
            fields?: Array<{
              condition?: Record<
                string,
                _GinkoCmsJsonDepth8
              > | null;
              defaultValue?:
                _GinkoCmsJsonDepth8;
              description?: string | null;
              fields?: Array<{
                condition?: Record<
                  string,
                  _GinkoCmsJsonDepth8
                > | null;
                defaultValue?:
                  _GinkoCmsJsonDepth8;
                description?: string | null;
                fields?: Array<{
                  condition?: Record<
                    string,
                    _GinkoCmsJsonDepth8
                  > | null;
                  defaultValue?:
                    _GinkoCmsJsonDepth8;
                  description?: string | null;
                  fields?: Array<{
                    condition?: Record<
                      string,
                      _GinkoCmsJsonDepth8
                    > | null;
                    defaultValue?:
                      _GinkoCmsJsonDepth8;
                    description?: string | null;
                    fields?: Array<{
                      condition?: Record<
                        string,
                        _GinkoCmsJsonDepth8
                      > | null;
                      defaultValue?:
                        _GinkoCmsJsonDepth8;
                      description?: string | null;
                      fields?: Array<{
                        condition?: Record<
                          string,
                          _GinkoCmsJsonDepth8
                        > | null;
                        defaultValue?:
                          _GinkoCmsJsonDepth8;
                        description?: string | null;
                        fields?: Array<{
                          condition?: Record<
                            string,
                            _GinkoCmsJsonDepth8
                          > | null;
                          defaultValue?:
                            _GinkoCmsJsonDepth8;
                          description?: string | null;
                          fields?: Array<{
                            condition?: Record<
                              string,
                              _GinkoCmsJsonDepth8
                            > | null;
                            defaultValue?:
                              _GinkoCmsJsonDepth8;
                            description?: string | null;
                            fields?: null;
                            hidden?: boolean;
                            key: string;
                            label?: string | Record<string, string> | null;
                            language?: string | null;
                            localized?: boolean;
                            max?: number | null;
                            media?: {
                              accept?: Array<string>;
                              aspectRatio?: string | null;
                            } | null;
                            min?: number | null;
                            options?: Array<string> | null;
                            order?: number;
                            relation?: {
                              collection: string;
                              multiple?: boolean;
                            } | null;
                            required?: boolean;
                            searchable?: boolean;
                            slugFrom?: string | null;
                            sortable?: boolean;
                            step?: number | null;
                            type:
                              | "text"
                              | "textarea"
                              | "richtext"
                              | "slug"
                              | "email"
                              | "url"
                              | "number"
                              | "range"
                              | "select"
                              | "multiselect"
                              | "radio"
                              | "checkbox"
                              | "toggle"
                              | "date"
                              | "datetime"
                              | "time"
                              | "json"
                              | "object"
                              | "array"
                              | "blocks"
                              | "relation"
                              | "relations"
                              | "image"
                              | "images"
                              | "file"
                              | "icon"
                              | "code"
                              | "color"
                              | "divider"
                              | "section";
                            validation?: Record<
                              string,
                              _GinkoCmsJsonDepth8
                            > | null;
                            width?: "full" | "half";
                          }> | null;
                          hidden?: boolean;
                          key: string;
                          label?: string | Record<string, string> | null;
                          language?: string | null;
                          localized?: boolean;
                          max?: number | null;
                          media?: {
                            accept?: Array<string>;
                            aspectRatio?: string | null;
                          } | null;
                          min?: number | null;
                          options?: Array<string> | null;
                          order?: number;
                          relation?: {
                            collection: string;
                            multiple?: boolean;
                          } | null;
                          required?: boolean;
                          searchable?: boolean;
                          slugFrom?: string | null;
                          sortable?: boolean;
                          step?: number | null;
                          type:
                            | "text"
                            | "textarea"
                            | "richtext"
                            | "slug"
                            | "email"
                            | "url"
                            | "number"
                            | "range"
                            | "select"
                            | "multiselect"
                            | "radio"
                            | "checkbox"
                            | "toggle"
                            | "date"
                            | "datetime"
                            | "time"
                            | "json"
                            | "object"
                            | "array"
                            | "blocks"
                            | "relation"
                            | "relations"
                            | "image"
                            | "images"
                            | "file"
                            | "icon"
                            | "code"
                            | "color"
                            | "divider"
                            | "section";
                          validation?: Record<
                            string,
                            _GinkoCmsJsonDepth8
                          > | null;
                          width?: "full" | "half";
                        }> | null;
                        hidden?: boolean;
                        key: string;
                        label?: string | Record<string, string> | null;
                        language?: string | null;
                        localized?: boolean;
                        max?: number | null;
                        media?: {
                          accept?: Array<string>;
                          aspectRatio?: string | null;
                        } | null;
                        min?: number | null;
                        options?: Array<string> | null;
                        order?: number;
                        relation?: {
                          collection: string;
                          multiple?: boolean;
                        } | null;
                        required?: boolean;
                        searchable?: boolean;
                        slugFrom?: string | null;
                        sortable?: boolean;
                        step?: number | null;
                        type:
                          | "text"
                          | "textarea"
                          | "richtext"
                          | "slug"
                          | "email"
                          | "url"
                          | "number"
                          | "range"
                          | "select"
                          | "multiselect"
                          | "radio"
                          | "checkbox"
                          | "toggle"
                          | "date"
                          | "datetime"
                          | "time"
                          | "json"
                          | "object"
                          | "array"
                          | "blocks"
                          | "relation"
                          | "relations"
                          | "image"
                          | "images"
                          | "file"
                          | "icon"
                          | "code"
                          | "color"
                          | "divider"
                          | "section";
                        validation?: Record<
                          string,
                          _GinkoCmsJsonDepth8
                        > | null;
                        width?: "full" | "half";
                      }> | null;
                      hidden?: boolean;
                      key: string;
                      label?: string | Record<string, string> | null;
                      language?: string | null;
                      localized?: boolean;
                      max?: number | null;
                      media?: {
                        accept?: Array<string>;
                        aspectRatio?: string | null;
                      } | null;
                      min?: number | null;
                      options?: Array<string> | null;
                      order?: number;
                      relation?: {
                        collection: string;
                        multiple?: boolean;
                      } | null;
                      required?: boolean;
                      searchable?: boolean;
                      slugFrom?: string | null;
                      sortable?: boolean;
                      step?: number | null;
                      type:
                        | "text"
                        | "textarea"
                        | "richtext"
                        | "slug"
                        | "email"
                        | "url"
                        | "number"
                        | "range"
                        | "select"
                        | "multiselect"
                        | "radio"
                        | "checkbox"
                        | "toggle"
                        | "date"
                        | "datetime"
                        | "time"
                        | "json"
                        | "object"
                        | "array"
                        | "blocks"
                        | "relation"
                        | "relations"
                        | "image"
                        | "images"
                        | "file"
                        | "icon"
                        | "code"
                        | "color"
                        | "divider"
                        | "section";
                      validation?: Record<
                        string,
                        _GinkoCmsJsonDepth8
                      > | null;
                      width?: "full" | "half";
                    }> | null;
                    hidden?: boolean;
                    key: string;
                    label?: string | Record<string, string> | null;
                    language?: string | null;
                    localized?: boolean;
                    max?: number | null;
                    media?: {
                      accept?: Array<string>;
                      aspectRatio?: string | null;
                    } | null;
                    min?: number | null;
                    options?: Array<string> | null;
                    order?: number;
                    relation?: {
                      collection: string;
                      multiple?: boolean;
                    } | null;
                    required?: boolean;
                    searchable?: boolean;
                    slugFrom?: string | null;
                    sortable?: boolean;
                    step?: number | null;
                    type:
                      | "text"
                      | "textarea"
                      | "richtext"
                      | "slug"
                      | "email"
                      | "url"
                      | "number"
                      | "range"
                      | "select"
                      | "multiselect"
                      | "radio"
                      | "checkbox"
                      | "toggle"
                      | "date"
                      | "datetime"
                      | "time"
                      | "json"
                      | "object"
                      | "array"
                      | "blocks"
                      | "relation"
                      | "relations"
                      | "image"
                      | "images"
                      | "file"
                      | "icon"
                      | "code"
                      | "color"
                      | "divider"
                      | "section";
                    validation?: Record<
                      string,
                      _GinkoCmsJsonDepth8
                    > | null;
                    width?: "full" | "half";
                  }> | null;
                  hidden?: boolean;
                  key: string;
                  label?: string | Record<string, string> | null;
                  language?: string | null;
                  localized?: boolean;
                  max?: number | null;
                  media?: {
                    accept?: Array<string>;
                    aspectRatio?: string | null;
                  } | null;
                  min?: number | null;
                  options?: Array<string> | null;
                  order?: number;
                  relation?: { collection: string; multiple?: boolean } | null;
                  required?: boolean;
                  searchable?: boolean;
                  slugFrom?: string | null;
                  sortable?: boolean;
                  step?: number | null;
                  type:
                    | "text"
                    | "textarea"
                    | "richtext"
                    | "slug"
                    | "email"
                    | "url"
                    | "number"
                    | "range"
                    | "select"
                    | "multiselect"
                    | "radio"
                    | "checkbox"
                    | "toggle"
                    | "date"
                    | "datetime"
                    | "time"
                    | "json"
                    | "object"
                    | "array"
                    | "blocks"
                    | "relation"
                    | "relations"
                    | "image"
                    | "images"
                    | "file"
                    | "icon"
                    | "code"
                    | "color"
                    | "divider"
                    | "section";
                  validation?: Record<
                    string,
                    _GinkoCmsJsonDepth8
                  > | null;
                  width?: "full" | "half";
                }> | null;
                hidden?: boolean;
                key: string;
                label?: string | Record<string, string> | null;
                language?: string | null;
                localized?: boolean;
                max?: number | null;
                media?: {
                  accept?: Array<string>;
                  aspectRatio?: string | null;
                } | null;
                min?: number | null;
                options?: Array<string> | null;
                order?: number;
                relation?: { collection: string; multiple?: boolean } | null;
                required?: boolean;
                searchable?: boolean;
                slugFrom?: string | null;
                sortable?: boolean;
                step?: number | null;
                type:
                  | "text"
                  | "textarea"
                  | "richtext"
                  | "slug"
                  | "email"
                  | "url"
                  | "number"
                  | "range"
                  | "select"
                  | "multiselect"
                  | "radio"
                  | "checkbox"
                  | "toggle"
                  | "date"
                  | "datetime"
                  | "time"
                  | "json"
                  | "object"
                  | "array"
                  | "blocks"
                  | "relation"
                  | "relations"
                  | "image"
                  | "images"
                  | "file"
                  | "icon"
                  | "code"
                  | "color"
                  | "divider"
                  | "section";
                validation?: Record<
                  string,
                  _GinkoCmsJsonDepth8
                > | null;
                width?: "full" | "half";
              }> | null;
              hidden?: boolean;
              key: string;
              label?: string | Record<string, string> | null;
              language?: string | null;
              localized?: boolean;
              max?: number | null;
              media?: {
                accept?: Array<string>;
                aspectRatio?: string | null;
              } | null;
              min?: number | null;
              options?: Array<string> | null;
              order?: number;
              relation?: { collection: string; multiple?: boolean } | null;
              required?: boolean;
              searchable?: boolean;
              slugFrom?: string | null;
              sortable?: boolean;
              step?: number | null;
              type:
                | "text"
                | "textarea"
                | "richtext"
                | "slug"
                | "email"
                | "url"
                | "number"
                | "range"
                | "select"
                | "multiselect"
                | "radio"
                | "checkbox"
                | "toggle"
                | "date"
                | "datetime"
                | "time"
                | "json"
                | "object"
                | "array"
                | "blocks"
                | "relation"
                | "relations"
                | "image"
                | "images"
                | "file"
                | "icon"
                | "code"
                | "color"
                | "divider"
                | "section";
              validation?: Record<
                string,
                _GinkoCmsJsonDepth8
              > | null;
              width?: "full" | "half";
            }> | null;
            hidden?: boolean;
            key: string;
            label?: string | Record<string, string> | null;
            language?: string | null;
            localized?: boolean;
            max?: number | null;
            media?: {
              accept?: Array<string>;
              aspectRatio?: string | null;
            } | null;
            min?: number | null;
            options?: Array<string> | null;
            order?: number;
            relation?: { collection: string; multiple?: boolean } | null;
            required?: boolean;
            searchable?: boolean;
            slugFrom?: string | null;
            sortable?: boolean;
            step?: number | null;
            type:
              | "text"
              | "textarea"
              | "richtext"
              | "slug"
              | "email"
              | "url"
              | "number"
              | "range"
              | "select"
              | "multiselect"
              | "radio"
              | "checkbox"
              | "toggle"
              | "date"
              | "datetime"
              | "time"
              | "json"
              | "object"
              | "array"
              | "blocks"
              | "relation"
              | "relations"
              | "image"
              | "images"
              | "file"
              | "icon"
              | "code"
              | "color"
              | "divider"
              | "section";
            validation?: Record<
              string,
              _GinkoCmsJsonDepth8
            > | null;
            width?: "full" | "half";
          }>;
          icon: string | null;
          label: string;
          labelMap: string | Record<string, string>;
          locales: Array<string>;
          mode: "route" | "none";
          pathPrefix: string;
          rootSlug: string | null;
          routing: {
            mode?: "route" | "none";
            pathPrefix: string;
            rootSlug?: string | null;
            singleton?: boolean;
            slugMode?: "shared" | "localized" | "stable" | "localizedStable";
          };
          settings:
            _GinkoCmsJsonDepth8;
          singleton: boolean;
          slug: string;
          slugMode: "shared" | "localized" | "stable" | "localizedStable";
          type: "flat" | "tree";
          updatedAt: number;
          updatedBy: string;
        },
        Name
      >;
      listCollections: FunctionReference<
        "query",
        "internal",
        {
          _trustedCaller?:
            | { kind: "anonymous"; subject: "system:anonymous" }
            | {
                email?: string;
                emailVerified?: boolean;
                kind: "user";
                name?: string;
                subject: string;
                userId: string;
              }
            | {
                clientId: string;
                issuer: string;
                kind: "mcp";
                scopes: Array<string>;
                subject: string;
                userId: string;
              }
            | { deployId: string; kind: "deploy"; subject: string };
        },
        Array<{
          _id: string;
          createdAt: number;
          fieldCount: number;
          icon: string | null;
          label: string;
          labelMap: string | Record<string, string>;
          locales: Array<string>;
          mode: "route" | "none";
          pathPrefix: string;
          rootSlug: string | null;
          routing: {
            mode?: "route" | "none";
            pathPrefix: string;
            rootSlug?: string | null;
            singleton?: boolean;
            slugMode?: "shared" | "localized" | "stable" | "localizedStable";
          };
          singleton: boolean;
          slug: string;
          slugMode: "shared" | "localized" | "stable" | "localizedStable";
          type: "flat" | "tree";
          updatedAt: number;
          updatedBy: string;
        }>,
        Name
      >;
      searchStudioEntries: FunctionReference<
        "query",
        "internal",
        { collection?: string; limit?: number; locale: string; query: string },
        Array<{
          collection: string;
          id: string;
          route: { href: string; slug: string };
          title: string;
        }>,
        Name
      >;
    };
    contract: {
      checkCmsContract: FunctionReference<
        "query",
        "internal",
        {
          content: Record<string, any>;
          contentHash: string;
          presentation: Record<
            string,
            _GinkoCmsJsonDepth8
          >;
          presentationHash: string;
        },
        {
          contentMatches: boolean;
          drift: Array<{ expected?: any; installed?: any; path: string }>;
          expectedContentHash: string;
          expectedPresentationHash: string;
          installedContentHash: string | null;
          installedPresentationHash: string | null;
          matches: boolean;
          presentationDrift: Array<{
            expected?: any;
            installed?: any;
            path: string;
          }>;
          presentationMatches: boolean;
          transitionRunId: string | null;
          transitionState: "ready" | "locked" | null;
        },
        Name
      >;
      getInstalledContractStatus: FunctionReference<
        "query",
        "internal",
        {
          _trustedCaller?:
            | { kind: "anonymous"; subject: "system:anonymous" }
            | {
                email?: string;
                emailVerified?: boolean;
                kind: "user";
                name?: string;
                subject: string;
                userId: string;
              }
            | {
                clientId: string;
                issuer: string;
                kind: "mcp";
                scopes: Array<string>;
                subject: string;
                userId: string;
              }
            | { deployId: string; kind: "deploy"; subject: string };
        },
        {
          installedContentHash: string | null;
          installedPresentationHash: string | null;
          transitionRunId: string | null;
          transitionState: "ready" | "locked" | null;
        },
        Name
      >;
      installCmsContract: FunctionReference<
        "mutation",
        "internal",
        {
          content: Record<string, any>;
          contentHash: string;
          presentation: Record<
            string,
            _GinkoCmsJsonDepth8
          >;
          presentationHash: string;
        },
        {
          collectionCount: number;
          contentHash: string;
          created: number;
          localeCount: number;
          missingFromConfig: Array<string>;
          presentationHash: string;
          skipped: number;
          transitionState: "ready";
          updated: number;
        },
        Name
      >;
    };
    contractTransitions: {
      activateContractTransition: FunctionReference<
        "mutation",
        "internal",
        { actor: string; generation: number; runId: string },
        {
          appliedCount: number;
          contentHash: string;
          presentationHash: string;
          state: "complete";
        },
        Name
      >;
      applyContractTransitionPage: FunctionReference<
        "mutation",
        "internal",
        {
          actor: string;
          cursor: string | null;
          generation: number;
          limit?: number;
          runId: string;
        },
        {
          applied: number;
          appliedCount: number;
          cursor: string | null;
          generation: number;
          readyToActivate: boolean;
        },
        Name
      >;
      beginContractTransition: FunctionReference<
        "mutation",
        "internal",
        {
          actor: string;
          runKey: string;
          targetContent: Record<string, any>;
          targetContentHash: string;
          targetPresentation: Record<
            string,
            _GinkoCmsJsonDepth8
          >;
          targetPresentationHash: string;
        },
        {
          affectedCollections: Array<string>;
          fromContentHash: string;
          fromPresentationHash: string;
          runId: string;
          state: string;
          toContentHash: string;
          toPresentationHash: string;
        },
        Name
      >;
      cancelContractTransition: FunctionReference<
        "mutation",
        "internal",
        { runId: string },
        { state: "cancelled" },
        Name
      >;
      getContractTransitionStatus: FunctionReference<
        "query",
        "internal",
        { runId: string },
        {
          appliedCount: number;
          cursor: string | null;
          fromContentHash: string;
          fromPresentationHash: string;
          generation: number;
          lockActive: boolean;
          pendingCount: number;
          runKey: string;
          scannedCount: number;
          stagedCount: number;
          stagedHash: string;
          state: string;
          toContentHash: string;
          toPresentationHash: string;
          validatedCount: number;
          validatedHash: string;
        },
        Name
      >;
      listContractTransitionPage: FunctionReference<
        "query",
        "internal",
        {
          cursor: string | null;
          generation: number;
          limit?: number;
          runId: string;
        },
        {
          continueCursor: string;
          isDone: boolean;
          page: Array<{
            current: {
              collection: string;
              draftVersion: number;
              entryId: string;
              lifecycle: "active" | "archived";
              locales: Record<
                string,
                {
                  bodyMdc: string;
                  slug: string | null;
                  values: Record<
                    string,
                    _GinkoCmsJsonDepth8
                  >;
                  version: number;
                }
              >;
              nodeKind: "page" | "folder" | "group" | "section" | null;
              orderRank: string;
              parentEntryId: string | null;
              shared: Record<
                string,
                _GinkoCmsJsonDepth8
              >;
              sharedVersion: number;
              slug: string;
              stableId: string;
            };
            entryId: string;
            inputDraftVersion: number;
            inputHash: string;
          }>;
        },
        Name
      >;
      stageContractTransitionPage: FunctionReference<
        "mutation",
        "internal",
        {
          cursor: string | null;
          generation: number;
          items: Array<{
            entryId: string;
            inputDraftVersion: number;
            inputHash: string;
            output: {
              locales: Record<
                string,
                {
                  bodyMdc: string;
                  slug: string | null;
                  values: Record<
                    string,
                    _GinkoCmsJsonDepth8
                  >;
                }
              >;
              nodeKind: "page" | "folder" | "group" | "section" | null;
              orderRank: string;
              parentEntryId: string | null;
              shared: Record<
                string,
                _GinkoCmsJsonDepth8
              >;
              slug: string;
            };
            outputHash: string;
          }>;
          limit?: number;
          runId: string;
        },
        {
          continueCursor: string | null;
          generation: number;
          scanned: number;
          scannedCount: number;
          staged: number;
          stagedCount: number;
          state: "staging" | "validating";
        },
        Name
      >;
      validateContractTransitionPage: FunctionReference<
        "mutation",
        "internal",
        {
          cursor: string | null;
          generation: number;
          limit?: number;
          runId: string;
        },
        {
          continueCursor: string | null;
          generation: number;
          state: "validating" | "ready";
          validated: number;
          validatedCount: number;
        },
        Name
      >;
    };
    diagnostics: {
      explainPublicVisibility: FunctionReference<
        "query",
        "internal",
        { collection: string; entryId: string; locale?: string },
        {
          collection: string;
          diagnostics: Array<{
            code:
              | "invalid_entry_id"
              | "data_only_collection"
              | "entry_collection_mismatch"
              | "archived_entry"
              | "unpublished_entry"
              | "missing_locale_route"
              | "missing_required_localized_field"
              | "missing_parent_route"
              | "route_collision"
              | "route_redirect_collision"
              | "redirect_collision"
              | "redirect_target_missing"
              | "excluded_from_sitemap"
              | "excluded_from_search"
              | "excluded_from_nav"
              | "broken_relation"
              | "capability_mismatch";
            collection: string;
            details: {
              claims?: Array<{
                collection: string;
                entryId: string;
                href?: string | null;
                kind: "route" | "redirect";
                locale: string;
                path: string;
                targetHref?: string | null;
                targetPath?: string | null;
              }>;
              fields?: Array<string>;
              parentEntryId?: string | null;
              parentPath?: string | null;
              relationField?: string | null;
              statuses?: Array<string>;
              targetCollection?: string | null;
              targetHref?: string | null;
              targetId?: string | null;
            } | null;
            entryId: string | null;
            href: string | null;
            locale: string | null;
            message: string;
            path: string | null;
            severity: "info" | "warning" | "error";
          }>;
          entryId: string;
          locales: Array<{
            href: string | null;
            locale: string;
            missingRequiredFields: Array<string>;
            nav: "included" | "excluded";
            path: string | null;
            published: boolean;
            reasons: Array<string>;
            search: "included" | "excluded";
            secondaryStatuses: Array<string>;
            sitemap: "included" | "excluded";
            status:
              | "public"
              | "archived"
              | "draft_only"
              | "missing_route"
              | "missing_required_fields"
              | "parent_not_public"
              | "collision"
              | "excluded";
          }>;
          mode: "route" | "none";
        },
        Name
      >;
    };
    draftPreview: {
      getDraftPreview: FunctionReference<
        "query",
        "internal",
        { entryId: string; locale: string },
        {
          bodyAstJson: string | null;
          collection: string;
          data: Record<
            string,
            _GinkoCmsJsonDepth8
          >;
          draftVersion: number;
          entryId: string;
          locale: string;
          path: string;
          publishedPath: string | null;
          status: "draft" | "published" | "archived";
          title: string;
          toc:
            | null
            | boolean
            | number
            | string
            | Array<
                _GinkoCmsJsonDepth7
              >
            | Record<
                string,
                _GinkoCmsJsonDepth7
              >
            | null;
          updatedAt: number;
        },
        Name
      >;
    };
    editor: {
      acknowledgeTranslationReview: FunctionReference<
        "mutation",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          entryId: string;
          expectedReviewId: string | null;
          expectedSharedVersion: number;
          expectedSourceDraftId: string;
          expectedSourceVersion: number;
          expectedTargetDraftId: string;
          expectedTargetVersion: number;
          targetLocale: string;
        },
        string,
        Name
      >;
      archiveEntryOperationExecute: FunctionReference<
        "mutation",
        "internal",
        {
          _confirmationToken?: string;
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          entryId: string;
        },
        | { status: "applied"; value: null }
        | { code: string; details: any; message: string; status: "blocked" }
        | { code: string; details: any; message: string; status: "stale" },
        Name
      >;
      createCheckpoint: FunctionReference<
        "mutation",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          entryId: string;
          message: string;
        },
        string,
        Name
      >;
      createEntry: FunctionReference<
        "mutation",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          bodyMdc?: string;
          collection: string;
          locale?: string;
          localized?: Record<
            string,
            _GinkoCmsJsonDepth8
          >;
          nodeKind?: "page" | "folder" | "group" | "section";
          orderRank?: string;
          parentEntryId?: string;
          shared?: Record<
            string,
            _GinkoCmsJsonDepth8
          >;
          slug: string;
          stagedAssetIds?: Array<string>;
        },
        string,
        Name
      >;
      createLocaleVariant: FunctionReference<
        "mutation",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          entryId: string;
          locale: string;
          source: { kind: "blank" } | { kind: "locale"; locale: string };
        },
        string,
        Name
      >;
      duplicateEntry: FunctionReference<
        "mutation",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          expectedSourceDraftVersion: number;
          sourceEntryId: string;
          variants: Array<{ locale: string; slug: string; title: string }>;
        },
        {
          draftVersion: number;
          entryId: string;
          locales: Array<string>;
          orderRank: string;
          parentEntryId: string | null;
          slug: string;
          stableId: string;
        },
        Name
      >;
      getDraftVsPublishedDiff: FunctionReference<
        "query",
        "internal",
        { entryId: string },
        {
          changes: Array<{
            field: string;
            left:
              | null
              | boolean
              | number
              | string
              | Array<
                  _GinkoCmsJsonDepth7
                >
              | Record<
                  string,
                  _GinkoCmsJsonDepth7
                >
              | null;
            right:
              | null
              | boolean
              | number
              | string
              | Array<
                  _GinkoCmsJsonDepth7
                >
              | Record<
                  string,
                  _GinkoCmsJsonDepth7
                >
              | null;
          }>;
        },
        Name
      >;
      getEntry: FunctionReference<
        "query",
        "internal",
        {
          _trustedCaller?:
            | { kind: "anonymous"; subject: "system:anonymous" }
            | {
                email?: string;
                emailVerified?: boolean;
                kind: "user";
                name?: string;
                subject: string;
                userId: string;
              }
            | {
                clientId: string;
                issuer: string;
                kind: "mcp";
                scopes: Array<string>;
                subject: string;
                userId: string;
              }
            | { deployId: string; kind: "deploy"; subject: string };
          id: string;
          locale?: string;
        },
        null | {
          _can?: Record<string, boolean>;
          _id: string;
          baseSlug: string;
          collection: string;
          createdAt: number;
          createdBy: string;
          data:
            _GinkoCmsJsonDepth8;
          dirtyLocales: Array<string>;
          draft:
            _GinkoCmsJsonDepth8;
          draftVersion: number;
          locale: string;
          localeData: {
            draft: {
              bodyMdc?: string | null;
              values: Record<
                string,
                _GinkoCmsJsonDepth8
              >;
            };
            draftId: string | null;
            draftPath: string;
            draftSlug: string | null;
            published: {
              bodyMdc?: string | null;
              values: Record<
                string,
                _GinkoCmsJsonDepth8
              >;
            } | null;
            publishedPath: string | null;
            publishedSlug: string | null;
          } | null;
          localeVariants: Array<{
            complete: boolean;
            draftExists: boolean;
            draftPath: string;
            entryId: string;
            filledRequired: number;
            isCurrent: boolean;
            label: string;
            locale: string;
            publishedPath: string | null;
            totalRequired: number;
            updatedAt: number;
          }>;
          locales: Array<{
            completion: {
              complete: boolean;
              errors: Array<{ field: string; message: string }>;
              filledRequired: number;
              totalRequired: number;
            };
            data: Record<
              string,
              _GinkoCmsJsonDepth8
            >;
            draft: {
              bodyMdc?: string | null;
              values: Record<
                string,
                _GinkoCmsJsonDepth8
              >;
            };
            draftExists: boolean;
            draftId: string | null;
            draftPath: string;
            draftSlug: string | null;
            entryId: string;
            locale: string;
            published: {
              bodyMdc?: string | null;
              values: Record<
                string,
                _GinkoCmsJsonDepth8
              >;
            } | null;
            publishedData: Record<
              string,
              _GinkoCmsJsonDepth8
            >;
            publishedPath: string | null;
            publishedSlug: string | null;
            updatedAt: number;
            updatedBy: string;
          }>;
          nodeKind: "page" | "folder" | "group" | "section";
          orderRank: string;
          parentEntryId: string | null;
          path: string | null;
          published:
            | null
            | boolean
            | number
            | string
            | Array<
                _GinkoCmsJsonDepth7
              >
            | Record<
                string,
                _GinkoCmsJsonDepth7
              >
            | null;
          publishedAt: number | null;
          publishedBy: string | null;
          publishedData:
            | null
            | boolean
            | number
            | string
            | Array<
                _GinkoCmsJsonDepth7
              >
            | Record<
                string,
                _GinkoCmsJsonDepth7
              >
            | null;
          schema: {
            fields: Array<{
              condition?: Record<
                string,
                _GinkoCmsJsonDepth8
              > | null;
              defaultValue?:
                _GinkoCmsJsonDepth8;
              description?: string | null;
              fields?: Array<{
                condition?: Record<
                  string,
                  _GinkoCmsJsonDepth8
                > | null;
                defaultValue?:
                  _GinkoCmsJsonDepth8;
                description?: string | null;
                fields?: Array<{
                  condition?: Record<
                    string,
                    _GinkoCmsJsonDepth8
                  > | null;
                  defaultValue?:
                    _GinkoCmsJsonDepth8;
                  description?: string | null;
                  fields?: Array<{
                    condition?: Record<
                      string,
                      _GinkoCmsJsonDepth8
                    > | null;
                    defaultValue?:
                      _GinkoCmsJsonDepth8;
                    description?: string | null;
                    fields?: Array<{
                      condition?: Record<
                        string,
                        _GinkoCmsJsonDepth8
                      > | null;
                      defaultValue?:
                        _GinkoCmsJsonDepth8;
                      description?: string | null;
                      fields?: Array<{
                        condition?: Record<
                          string,
                          _GinkoCmsJsonDepth8
                        > | null;
                        defaultValue?:
                          _GinkoCmsJsonDepth8;
                        description?: string | null;
                        fields?: Array<{
                          condition?: Record<
                            string,
                            _GinkoCmsJsonDepth8
                          > | null;
                          defaultValue?:
                            _GinkoCmsJsonDepth8;
                          description?: string | null;
                          fields?: Array<{
                            condition?: Record<
                              string,
                              _GinkoCmsJsonDepth8
                            > | null;
                            defaultValue?:
                              _GinkoCmsJsonDepth8;
                            description?: string | null;
                            fields?: Array<{
                              condition?: Record<
                                string,
                                _GinkoCmsJsonDepth8
                              > | null;
                              defaultValue?:
                                _GinkoCmsJsonDepth8;
                              description?: string | null;
                              fields?: null;
                              hidden?: boolean;
                              key: string;
                              label?: string | Record<string, string> | null;
                              language?: string | null;
                              localized?: boolean;
                              max?: number | null;
                              media?: {
                                accept?: Array<string>;
                                aspectRatio?: string | null;
                              } | null;
                              min?: number | null;
                              options?: Array<string> | null;
                              order?: number;
                              relation?: {
                                collection: string;
                                multiple?: boolean;
                              } | null;
                              required?: boolean;
                              searchable?: boolean;
                              slugFrom?: string | null;
                              sortable?: boolean;
                              step?: number | null;
                              type:
                                | "text"
                                | "textarea"
                                | "richtext"
                                | "slug"
                                | "email"
                                | "url"
                                | "number"
                                | "range"
                                | "select"
                                | "multiselect"
                                | "radio"
                                | "checkbox"
                                | "toggle"
                                | "date"
                                | "datetime"
                                | "time"
                                | "json"
                                | "object"
                                | "array"
                                | "blocks"
                                | "relation"
                                | "relations"
                                | "image"
                                | "images"
                                | "file"
                                | "icon"
                                | "code"
                                | "color"
                                | "divider"
                                | "section";
                              validation?: Record<
                                string,
                                _GinkoCmsJsonDepth8
                              > | null;
                              width?: "full" | "half";
                            }> | null;
                            hidden?: boolean;
                            key: string;
                            label?: string | Record<string, string> | null;
                            language?: string | null;
                            localized?: boolean;
                            max?: number | null;
                            media?: {
                              accept?: Array<string>;
                              aspectRatio?: string | null;
                            } | null;
                            min?: number | null;
                            options?: Array<string> | null;
                            order?: number;
                            relation?: {
                              collection: string;
                              multiple?: boolean;
                            } | null;
                            required?: boolean;
                            searchable?: boolean;
                            slugFrom?: string | null;
                            sortable?: boolean;
                            step?: number | null;
                            type:
                              | "text"
                              | "textarea"
                              | "richtext"
                              | "slug"
                              | "email"
                              | "url"
                              | "number"
                              | "range"
                              | "select"
                              | "multiselect"
                              | "radio"
                              | "checkbox"
                              | "toggle"
                              | "date"
                              | "datetime"
                              | "time"
                              | "json"
                              | "object"
                              | "array"
                              | "blocks"
                              | "relation"
                              | "relations"
                              | "image"
                              | "images"
                              | "file"
                              | "icon"
                              | "code"
                              | "color"
                              | "divider"
                              | "section";
                            validation?: Record<
                              string,
                              _GinkoCmsJsonDepth8
                            > | null;
                            width?: "full" | "half";
                          }> | null;
                          hidden?: boolean;
                          key: string;
                          label?: string | Record<string, string> | null;
                          language?: string | null;
                          localized?: boolean;
                          max?: number | null;
                          media?: {
                            accept?: Array<string>;
                            aspectRatio?: string | null;
                          } | null;
                          min?: number | null;
                          options?: Array<string> | null;
                          order?: number;
                          relation?: {
                            collection: string;
                            multiple?: boolean;
                          } | null;
                          required?: boolean;
                          searchable?: boolean;
                          slugFrom?: string | null;
                          sortable?: boolean;
                          step?: number | null;
                          type:
                            | "text"
                            | "textarea"
                            | "richtext"
                            | "slug"
                            | "email"
                            | "url"
                            | "number"
                            | "range"
                            | "select"
                            | "multiselect"
                            | "radio"
                            | "checkbox"
                            | "toggle"
                            | "date"
                            | "datetime"
                            | "time"
                            | "json"
                            | "object"
                            | "array"
                            | "blocks"
                            | "relation"
                            | "relations"
                            | "image"
                            | "images"
                            | "file"
                            | "icon"
                            | "code"
                            | "color"
                            | "divider"
                            | "section";
                          validation?: Record<
                            string,
                            _GinkoCmsJsonDepth8
                          > | null;
                          width?: "full" | "half";
                        }> | null;
                        hidden?: boolean;
                        key: string;
                        label?: string | Record<string, string> | null;
                        language?: string | null;
                        localized?: boolean;
                        max?: number | null;
                        media?: {
                          accept?: Array<string>;
                          aspectRatio?: string | null;
                        } | null;
                        min?: number | null;
                        options?: Array<string> | null;
                        order?: number;
                        relation?: {
                          collection: string;
                          multiple?: boolean;
                        } | null;
                        required?: boolean;
                        searchable?: boolean;
                        slugFrom?: string | null;
                        sortable?: boolean;
                        step?: number | null;
                        type:
                          | "text"
                          | "textarea"
                          | "richtext"
                          | "slug"
                          | "email"
                          | "url"
                          | "number"
                          | "range"
                          | "select"
                          | "multiselect"
                          | "radio"
                          | "checkbox"
                          | "toggle"
                          | "date"
                          | "datetime"
                          | "time"
                          | "json"
                          | "object"
                          | "array"
                          | "blocks"
                          | "relation"
                          | "relations"
                          | "image"
                          | "images"
                          | "file"
                          | "icon"
                          | "code"
                          | "color"
                          | "divider"
                          | "section";
                        validation?: Record<
                          string,
                          _GinkoCmsJsonDepth8
                        > | null;
                        width?: "full" | "half";
                      }> | null;
                      hidden?: boolean;
                      key: string;
                      label?: string | Record<string, string> | null;
                      language?: string | null;
                      localized?: boolean;
                      max?: number | null;
                      media?: {
                        accept?: Array<string>;
                        aspectRatio?: string | null;
                      } | null;
                      min?: number | null;
                      options?: Array<string> | null;
                      order?: number;
                      relation?: {
                        collection: string;
                        multiple?: boolean;
                      } | null;
                      required?: boolean;
                      searchable?: boolean;
                      slugFrom?: string | null;
                      sortable?: boolean;
                      step?: number | null;
                      type:
                        | "text"
                        | "textarea"
                        | "richtext"
                        | "slug"
                        | "email"
                        | "url"
                        | "number"
                        | "range"
                        | "select"
                        | "multiselect"
                        | "radio"
                        | "checkbox"
                        | "toggle"
                        | "date"
                        | "datetime"
                        | "time"
                        | "json"
                        | "object"
                        | "array"
                        | "blocks"
                        | "relation"
                        | "relations"
                        | "image"
                        | "images"
                        | "file"
                        | "icon"
                        | "code"
                        | "color"
                        | "divider"
                        | "section";
                      validation?: Record<
                        string,
                        _GinkoCmsJsonDepth8
                      > | null;
                      width?: "full" | "half";
                    }> | null;
                    hidden?: boolean;
                    key: string;
                    label?: string | Record<string, string> | null;
                    language?: string | null;
                    localized?: boolean;
                    max?: number | null;
                    media?: {
                      accept?: Array<string>;
                      aspectRatio?: string | null;
                    } | null;
                    min?: number | null;
                    options?: Array<string> | null;
                    order?: number;
                    relation?: {
                      collection: string;
                      multiple?: boolean;
                    } | null;
                    required?: boolean;
                    searchable?: boolean;
                    slugFrom?: string | null;
                    sortable?: boolean;
                    step?: number | null;
                    type:
                      | "text"
                      | "textarea"
                      | "richtext"
                      | "slug"
                      | "email"
                      | "url"
                      | "number"
                      | "range"
                      | "select"
                      | "multiselect"
                      | "radio"
                      | "checkbox"
                      | "toggle"
                      | "date"
                      | "datetime"
                      | "time"
                      | "json"
                      | "object"
                      | "array"
                      | "blocks"
                      | "relation"
                      | "relations"
                      | "image"
                      | "images"
                      | "file"
                      | "icon"
                      | "code"
                      | "color"
                      | "divider"
                      | "section";
                    validation?: Record<
                      string,
                      _GinkoCmsJsonDepth8
                    > | null;
                    width?: "full" | "half";
                  }> | null;
                  hidden?: boolean;
                  key: string;
                  label?: string | Record<string, string> | null;
                  language?: string | null;
                  localized?: boolean;
                  max?: number | null;
                  media?: {
                    accept?: Array<string>;
                    aspectRatio?: string | null;
                  } | null;
                  min?: number | null;
                  options?: Array<string> | null;
                  order?: number;
                  relation?: { collection: string; multiple?: boolean } | null;
                  required?: boolean;
                  searchable?: boolean;
                  slugFrom?: string | null;
                  sortable?: boolean;
                  step?: number | null;
                  type:
                    | "text"
                    | "textarea"
                    | "richtext"
                    | "slug"
                    | "email"
                    | "url"
                    | "number"
                    | "range"
                    | "select"
                    | "multiselect"
                    | "radio"
                    | "checkbox"
                    | "toggle"
                    | "date"
                    | "datetime"
                    | "time"
                    | "json"
                    | "object"
                    | "array"
                    | "blocks"
                    | "relation"
                    | "relations"
                    | "image"
                    | "images"
                    | "file"
                    | "icon"
                    | "code"
                    | "color"
                    | "divider"
                    | "section";
                  validation?: Record<
                    string,
                    _GinkoCmsJsonDepth8
                  > | null;
                  width?: "full" | "half";
                }> | null;
                hidden?: boolean;
                key: string;
                label?: string | Record<string, string> | null;
                language?: string | null;
                localized?: boolean;
                max?: number | null;
                media?: {
                  accept?: Array<string>;
                  aspectRatio?: string | null;
                } | null;
                min?: number | null;
                options?: Array<string> | null;
                order?: number;
                relation?: { collection: string; multiple?: boolean } | null;
                required?: boolean;
                searchable?: boolean;
                slugFrom?: string | null;
                sortable?: boolean;
                step?: number | null;
                type:
                  | "text"
                  | "textarea"
                  | "richtext"
                  | "slug"
                  | "email"
                  | "url"
                  | "number"
                  | "range"
                  | "select"
                  | "multiselect"
                  | "radio"
                  | "checkbox"
                  | "toggle"
                  | "date"
                  | "datetime"
                  | "time"
                  | "json"
                  | "object"
                  | "array"
                  | "blocks"
                  | "relation"
                  | "relations"
                  | "image"
                  | "images"
                  | "file"
                  | "icon"
                  | "code"
                  | "color"
                  | "divider"
                  | "section";
                validation?: Record<
                  string,
                  _GinkoCmsJsonDepth8
                > | null;
                width?: "full" | "half";
              }> | null;
              hidden?: boolean;
              key: string;
              label?: string | Record<string, string> | null;
              language?: string | null;
              localized?: boolean;
              max?: number | null;
              media?: {
                accept?: Array<string>;
                aspectRatio?: string | null;
              } | null;
              min?: number | null;
              options?: Array<string> | null;
              order?: number;
              relation?: { collection: string; multiple?: boolean } | null;
              required?: boolean;
              searchable?: boolean;
              slugFrom?: string | null;
              sortable?: boolean;
              step?: number | null;
              type:
                | "text"
                | "textarea"
                | "richtext"
                | "slug"
                | "email"
                | "url"
                | "number"
                | "range"
                | "select"
                | "multiselect"
                | "radio"
                | "checkbox"
                | "toggle"
                | "date"
                | "datetime"
                | "time"
                | "json"
                | "object"
                | "array"
                | "blocks"
                | "relation"
                | "relations"
                | "image"
                | "images"
                | "file"
                | "icon"
                | "code"
                | "color"
                | "divider"
                | "section";
              validation?: Record<
                string,
                _GinkoCmsJsonDepth8
              > | null;
              width?: "full" | "half";
            }>;
            locales: Array<string>;
            routing: {
              mode?: "route" | "none";
              pathPrefix: string;
              rootSlug?: string | null;
              singleton?: boolean;
              slugMode?: "shared" | "localized" | "stable" | "localizedStable";
            };
            settings:
              _GinkoCmsJsonDepth8;
            slug: string;
            type: "flat" | "tree";
          };
          slug: string;
          stableId: string | null;
          status: "draft" | "published" | "archived";
          updatedAt: number;
          updatedBy: string;
        },
        Name
      >;
      getEntryActivity: FunctionReference<
        "query",
        "internal",
        {
          entryId: string;
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
        },
        {
          continueCursor: string;
          isDone: boolean;
          page: Array<{
            _id: string;
            appIdentityId: string;
            createdAt: number;
            detail:
              | null
              | boolean
              | number
              | string
              | Array<
                  _GinkoCmsJsonDepth7
                >
              | Record<
                  string,
                  _GinkoCmsJsonDepth7
                >
              | null;
            displaySummary: string;
            kind: string;
            locale: string | null;
            outcome: "applied" | "failed" | "blocked" | "stale";
            summary: string;
          }>;
        },
        Name
      >;
      getEntryReadinessDetail: FunctionReference<
        "query",
        "internal",
        {
          _trustedCaller?:
            | { kind: "anonymous"; subject: "system:anonymous" }
            | {
                email?: string;
                emailVerified?: boolean;
                kind: "user";
                name?: string;
                subject: string;
                userId: string;
              }
            | {
                clientId: string;
                issuer: string;
                kind: "mcp";
                scopes: Array<string>;
                subject: string;
                userId: string;
              }
            | { deployId: string; kind: "deploy"; subject: string };
          entryId: string;
        },
        {
          collection: string;
          entryId: string;
          locales: Array<{
            affectedPublicUrls: Array<{
              afterHref: string | null;
              afterPath: string | null;
              beforeHref: string | null;
              beforePath: string | null;
              entryId: string;
              kind: "current_entry" | "descendant";
              locale: string;
              reason:
                | "publish"
                | "route_changed"
                | "parent_route_changed"
                | "unpublish"
                | "archive";
            }>;
            blockers: Array<{
              code:
                | "required_field_missing"
                | "required_localized_field_missing"
                | "required_shared_field_missing"
                | "body_required"
                | "seo_title_required"
                | "seo_description_required"
                | "asset_alt_required"
                | "asset_caption_required"
                | "collection_schema_invalid"
                | "data_only_required_field_missing"
                | "locale_missing"
                | "locale_not_configured"
                | "primary_locale_missing"
                | "default_locale_unknown"
                | "fallback_not_configured"
                | "locale_parent_missing"
                | "locale_public_projection_missing"
                | "locale_public_route_missing"
                | "locale_slug_missing"
                | "locale_switch_target_missing"
                | "route_missing"
                | "route_collision"
                | "route_reserved"
                | "route_invalid"
                | "route_parent_not_public"
                | "route_descendant_collision"
                | "route_descendant_rebuild_failed"
                | "route_cycle_detected"
                | "route_depth_exceeded"
                | "route_slug_unchanged_noop"
                | "review_request_stale"
                | "review_preview_stale"
                | "review_preview_missing"
                | "review_not_authorized"
                | "review_already_closed"
                | "review_publish_blocked"
                | "review_locale_mismatch"
                | "review_version_hash_mismatch"
                | "permission_publish_missing"
                | "permission_review_missing"
                | "permission_archive_missing"
                | "permission_restore_missing"
                | "permission_agent_scope_missing"
                | "permission_member_inactive"
                | "permission_api_key_revoked"
                | "permission_role_not_allowed"
                | "agent_run_missing"
                | "agent_run_not_owned"
                | "agent_run_closed"
                | "agent_publish_requires_permission"
                | "agent_archive_requires_permission"
                | "agent_restore_requires_permission"
                | "agent_review_required"
                | "agent_operation_not_supported"
                | "asset_missing"
                | "asset_not_public"
                | "asset_policy_blocked"
                | "asset_metadata_stale"
                | "asset_alt_missing"
                | "asset_caption_missing"
                | "asset_ref_rebuild_failed"
                | "asset_upload_pending"
                | "relation_target_missing"
                | "relation_target_not_public"
                | "relation_locale_missing"
                | "relation_collection_invalid"
                | "relation_cycle_detected"
                | "relation_validation_failed"
                | "projection_public_entry_missing"
                | "projection_public_route_missing"
                | "projection_revision_missing"
                | "projection_revision_locale_missing"
                | "projection_rebuild_failed"
                | "projection_route_mismatch"
                | "projection_asset_ref_mismatch"
                | "projection_cache_tags_missing"
                | "revalidation_pending"
                | "revalidation_failed"
                | "revalidation_delivery_missing"
                | "revalidation_adapter_unconfigured"
                | "revalidation_cache_tag_missing"
                | "revalidation_event_stale"
                | "settings_missing"
                | "collection_missing"
                | "entry_missing"
                | "entry_archived"
                | "entry_collection_mismatch"
                | "draft_version_conflict"
                | "draft_hash_mismatch"
                | "confirmation_missing"
                | "confirmation_expired"
                | "confirmation_mismatch";
              diagnosticId: string | null;
              fieldPath: string | null;
              locale: string | null;
              messageParams: Record<string, string | number | boolean | null>;
              severity: "blocker" | "warning" | "info";
            }>;
            canArchive: boolean;
            canPreview: boolean;
            canPublish: boolean;
            canRequestReview: boolean;
            currentDraftVersion: number | null;
            currentPublishedRevisionId: string | null;
            draftExists: boolean;
            draftUrl: string | null;
            hasUnpublishedChanges: boolean;
            infos: Array<{
              code:
                | "required_field_missing"
                | "required_localized_field_missing"
                | "required_shared_field_missing"
                | "body_required"
                | "seo_title_required"
                | "seo_description_required"
                | "asset_alt_required"
                | "asset_caption_required"
                | "collection_schema_invalid"
                | "data_only_required_field_missing"
                | "locale_missing"
                | "locale_not_configured"
                | "primary_locale_missing"
                | "default_locale_unknown"
                | "fallback_not_configured"
                | "locale_parent_missing"
                | "locale_public_projection_missing"
                | "locale_public_route_missing"
                | "locale_slug_missing"
                | "locale_switch_target_missing"
                | "route_missing"
                | "route_collision"
                | "route_reserved"
                | "route_invalid"
                | "route_parent_not_public"
                | "route_descendant_collision"
                | "route_descendant_rebuild_failed"
                | "route_cycle_detected"
                | "route_depth_exceeded"
                | "route_slug_unchanged_noop"
                | "review_request_stale"
                | "review_preview_stale"
                | "review_preview_missing"
                | "review_not_authorized"
                | "review_already_closed"
                | "review_publish_blocked"
                | "review_locale_mismatch"
                | "review_version_hash_mismatch"
                | "permission_publish_missing"
                | "permission_review_missing"
                | "permission_archive_missing"
                | "permission_restore_missing"
                | "permission_agent_scope_missing"
                | "permission_member_inactive"
                | "permission_api_key_revoked"
                | "permission_role_not_allowed"
                | "agent_run_missing"
                | "agent_run_not_owned"
                | "agent_run_closed"
                | "agent_publish_requires_permission"
                | "agent_archive_requires_permission"
                | "agent_restore_requires_permission"
                | "agent_review_required"
                | "agent_operation_not_supported"
                | "asset_missing"
                | "asset_not_public"
                | "asset_policy_blocked"
                | "asset_metadata_stale"
                | "asset_alt_missing"
                | "asset_caption_missing"
                | "asset_ref_rebuild_failed"
                | "asset_upload_pending"
                | "relation_target_missing"
                | "relation_target_not_public"
                | "relation_locale_missing"
                | "relation_collection_invalid"
                | "relation_cycle_detected"
                | "relation_validation_failed"
                | "projection_public_entry_missing"
                | "projection_public_route_missing"
                | "projection_revision_missing"
                | "projection_revision_locale_missing"
                | "projection_rebuild_failed"
                | "projection_route_mismatch"
                | "projection_asset_ref_mismatch"
                | "projection_cache_tags_missing"
                | "revalidation_pending"
                | "revalidation_failed"
                | "revalidation_delivery_missing"
                | "revalidation_adapter_unconfigured"
                | "revalidation_cache_tag_missing"
                | "revalidation_event_stale"
                | "settings_missing"
                | "collection_missing"
                | "entry_missing"
                | "entry_archived"
                | "entry_collection_mismatch"
                | "draft_version_conflict"
                | "draft_hash_mismatch"
                | "confirmation_missing"
                | "confirmation_expired"
                | "confirmation_mismatch";
              diagnosticId: string | null;
              fieldPath: string | null;
              locale: string | null;
              messageParams: Record<string, string | number | boolean | null>;
              severity: "blocker" | "warning" | "info";
            }>;
            locale: string;
            nextAction: {
              kind:
                | "continue_editing"
                | "fill_required_field"
                | "fill_required_localized_field"
                | "fill_required_shared_field"
                | "add_locale"
                | "publish_locale"
                | "resolve_route_collision"
                | "request_review"
                | "open_review"
                | "view_public_page";
              locale: string | null;
              params: Record<string, string | number | boolean | null>;
              target:
                "editor" | "field" | "locale" | "route" | "review" | "publish";
            };
            publicUrl: string | null;
            published: boolean;
            reviewRequestId: string | null;
            state:
              | "draft"
              | "needs_work"
              | "ready"
              | "in_review"
              | "live"
              | "live_with_changes"
              | "missing";
            warnings: Array<{
              code:
                | "required_field_missing"
                | "required_localized_field_missing"
                | "required_shared_field_missing"
                | "body_required"
                | "seo_title_required"
                | "seo_description_required"
                | "asset_alt_required"
                | "asset_caption_required"
                | "collection_schema_invalid"
                | "data_only_required_field_missing"
                | "locale_missing"
                | "locale_not_configured"
                | "primary_locale_missing"
                | "default_locale_unknown"
                | "fallback_not_configured"
                | "locale_parent_missing"
                | "locale_public_projection_missing"
                | "locale_public_route_missing"
                | "locale_slug_missing"
                | "locale_switch_target_missing"
                | "route_missing"
                | "route_collision"
                | "route_reserved"
                | "route_invalid"
                | "route_parent_not_public"
                | "route_descendant_collision"
                | "route_descendant_rebuild_failed"
                | "route_cycle_detected"
                | "route_depth_exceeded"
                | "route_slug_unchanged_noop"
                | "review_request_stale"
                | "review_preview_stale"
                | "review_preview_missing"
                | "review_not_authorized"
                | "review_already_closed"
                | "review_publish_blocked"
                | "review_locale_mismatch"
                | "review_version_hash_mismatch"
                | "permission_publish_missing"
                | "permission_review_missing"
                | "permission_archive_missing"
                | "permission_restore_missing"
                | "permission_agent_scope_missing"
                | "permission_member_inactive"
                | "permission_api_key_revoked"
                | "permission_role_not_allowed"
                | "agent_run_missing"
                | "agent_run_not_owned"
                | "agent_run_closed"
                | "agent_publish_requires_permission"
                | "agent_archive_requires_permission"
                | "agent_restore_requires_permission"
                | "agent_review_required"
                | "agent_operation_not_supported"
                | "asset_missing"
                | "asset_not_public"
                | "asset_policy_blocked"
                | "asset_metadata_stale"
                | "asset_alt_missing"
                | "asset_caption_missing"
                | "asset_ref_rebuild_failed"
                | "asset_upload_pending"
                | "relation_target_missing"
                | "relation_target_not_public"
                | "relation_locale_missing"
                | "relation_collection_invalid"
                | "relation_cycle_detected"
                | "relation_validation_failed"
                | "projection_public_entry_missing"
                | "projection_public_route_missing"
                | "projection_revision_missing"
                | "projection_revision_locale_missing"
                | "projection_rebuild_failed"
                | "projection_route_mismatch"
                | "projection_asset_ref_mismatch"
                | "projection_cache_tags_missing"
                | "revalidation_pending"
                | "revalidation_failed"
                | "revalidation_delivery_missing"
                | "revalidation_adapter_unconfigured"
                | "revalidation_cache_tag_missing"
                | "revalidation_event_stale"
                | "settings_missing"
                | "collection_missing"
                | "entry_missing"
                | "entry_archived"
                | "entry_collection_mismatch"
                | "draft_version_conflict"
                | "draft_hash_mismatch"
                | "confirmation_missing"
                | "confirmation_expired"
                | "confirmation_mismatch";
              diagnosticId: string | null;
              fieldPath: string | null;
              locale: string | null;
              messageParams: Record<string, string | number | boolean | null>;
              severity: "blocker" | "warning" | "info";
            }>;
          }>;
          primaryLocale: string;
          updatedAt: number;
        },
        Name
      >;
      getEntryReadinessSummary: FunctionReference<
        "query",
        "internal",
        { entryId: string },
        {
          collection: string;
          entryId: string;
          locales: Array<{
            affectedPublicUrls: Array<{
              afterHref: string | null;
              afterPath: string | null;
              beforeHref: string | null;
              beforePath: string | null;
              entryId: string;
              kind: "current_entry" | "descendant";
              locale: string;
              reason:
                | "publish"
                | "route_changed"
                | "parent_route_changed"
                | "unpublish"
                | "archive";
            }>;
            blockers: Array<{
              code:
                | "required_field_missing"
                | "required_localized_field_missing"
                | "required_shared_field_missing"
                | "body_required"
                | "seo_title_required"
                | "seo_description_required"
                | "asset_alt_required"
                | "asset_caption_required"
                | "collection_schema_invalid"
                | "data_only_required_field_missing"
                | "locale_missing"
                | "locale_not_configured"
                | "primary_locale_missing"
                | "default_locale_unknown"
                | "fallback_not_configured"
                | "locale_parent_missing"
                | "locale_public_projection_missing"
                | "locale_public_route_missing"
                | "locale_slug_missing"
                | "locale_switch_target_missing"
                | "route_missing"
                | "route_collision"
                | "route_reserved"
                | "route_invalid"
                | "route_parent_not_public"
                | "route_descendant_collision"
                | "route_descendant_rebuild_failed"
                | "route_cycle_detected"
                | "route_depth_exceeded"
                | "route_slug_unchanged_noop"
                | "review_request_stale"
                | "review_preview_stale"
                | "review_preview_missing"
                | "review_not_authorized"
                | "review_already_closed"
                | "review_publish_blocked"
                | "review_locale_mismatch"
                | "review_version_hash_mismatch"
                | "permission_publish_missing"
                | "permission_review_missing"
                | "permission_archive_missing"
                | "permission_restore_missing"
                | "permission_agent_scope_missing"
                | "permission_member_inactive"
                | "permission_api_key_revoked"
                | "permission_role_not_allowed"
                | "agent_run_missing"
                | "agent_run_not_owned"
                | "agent_run_closed"
                | "agent_publish_requires_permission"
                | "agent_archive_requires_permission"
                | "agent_restore_requires_permission"
                | "agent_review_required"
                | "agent_operation_not_supported"
                | "asset_missing"
                | "asset_not_public"
                | "asset_policy_blocked"
                | "asset_metadata_stale"
                | "asset_alt_missing"
                | "asset_caption_missing"
                | "asset_ref_rebuild_failed"
                | "asset_upload_pending"
                | "relation_target_missing"
                | "relation_target_not_public"
                | "relation_locale_missing"
                | "relation_collection_invalid"
                | "relation_cycle_detected"
                | "relation_validation_failed"
                | "projection_public_entry_missing"
                | "projection_public_route_missing"
                | "projection_revision_missing"
                | "projection_revision_locale_missing"
                | "projection_rebuild_failed"
                | "projection_route_mismatch"
                | "projection_asset_ref_mismatch"
                | "projection_cache_tags_missing"
                | "revalidation_pending"
                | "revalidation_failed"
                | "revalidation_delivery_missing"
                | "revalidation_adapter_unconfigured"
                | "revalidation_cache_tag_missing"
                | "revalidation_event_stale"
                | "settings_missing"
                | "collection_missing"
                | "entry_missing"
                | "entry_archived"
                | "entry_collection_mismatch"
                | "draft_version_conflict"
                | "draft_hash_mismatch"
                | "confirmation_missing"
                | "confirmation_expired"
                | "confirmation_mismatch";
              diagnosticId: string | null;
              fieldPath: string | null;
              locale: string | null;
              messageParams: Record<string, string | number | boolean | null>;
              severity: "blocker" | "warning" | "info";
            }>;
            canArchive: boolean;
            canPreview: boolean;
            canPublish: boolean;
            canRequestReview: boolean;
            currentDraftVersion: number | null;
            currentPublishedRevisionId: string | null;
            draftExists: boolean;
            draftUrl: string | null;
            hasUnpublishedChanges: boolean;
            infos: Array<{
              code:
                | "required_field_missing"
                | "required_localized_field_missing"
                | "required_shared_field_missing"
                | "body_required"
                | "seo_title_required"
                | "seo_description_required"
                | "asset_alt_required"
                | "asset_caption_required"
                | "collection_schema_invalid"
                | "data_only_required_field_missing"
                | "locale_missing"
                | "locale_not_configured"
                | "primary_locale_missing"
                | "default_locale_unknown"
                | "fallback_not_configured"
                | "locale_parent_missing"
                | "locale_public_projection_missing"
                | "locale_public_route_missing"
                | "locale_slug_missing"
                | "locale_switch_target_missing"
                | "route_missing"
                | "route_collision"
                | "route_reserved"
                | "route_invalid"
                | "route_parent_not_public"
                | "route_descendant_collision"
                | "route_descendant_rebuild_failed"
                | "route_cycle_detected"
                | "route_depth_exceeded"
                | "route_slug_unchanged_noop"
                | "review_request_stale"
                | "review_preview_stale"
                | "review_preview_missing"
                | "review_not_authorized"
                | "review_already_closed"
                | "review_publish_blocked"
                | "review_locale_mismatch"
                | "review_version_hash_mismatch"
                | "permission_publish_missing"
                | "permission_review_missing"
                | "permission_archive_missing"
                | "permission_restore_missing"
                | "permission_agent_scope_missing"
                | "permission_member_inactive"
                | "permission_api_key_revoked"
                | "permission_role_not_allowed"
                | "agent_run_missing"
                | "agent_run_not_owned"
                | "agent_run_closed"
                | "agent_publish_requires_permission"
                | "agent_archive_requires_permission"
                | "agent_restore_requires_permission"
                | "agent_review_required"
                | "agent_operation_not_supported"
                | "asset_missing"
                | "asset_not_public"
                | "asset_policy_blocked"
                | "asset_metadata_stale"
                | "asset_alt_missing"
                | "asset_caption_missing"
                | "asset_ref_rebuild_failed"
                | "asset_upload_pending"
                | "relation_target_missing"
                | "relation_target_not_public"
                | "relation_locale_missing"
                | "relation_collection_invalid"
                | "relation_cycle_detected"
                | "relation_validation_failed"
                | "projection_public_entry_missing"
                | "projection_public_route_missing"
                | "projection_revision_missing"
                | "projection_revision_locale_missing"
                | "projection_rebuild_failed"
                | "projection_route_mismatch"
                | "projection_asset_ref_mismatch"
                | "projection_cache_tags_missing"
                | "revalidation_pending"
                | "revalidation_failed"
                | "revalidation_delivery_missing"
                | "revalidation_adapter_unconfigured"
                | "revalidation_cache_tag_missing"
                | "revalidation_event_stale"
                | "settings_missing"
                | "collection_missing"
                | "entry_missing"
                | "entry_archived"
                | "entry_collection_mismatch"
                | "draft_version_conflict"
                | "draft_hash_mismatch"
                | "confirmation_missing"
                | "confirmation_expired"
                | "confirmation_mismatch";
              diagnosticId: string | null;
              fieldPath: string | null;
              locale: string | null;
              messageParams: Record<string, string | number | boolean | null>;
              severity: "blocker" | "warning" | "info";
            }>;
            locale: string;
            nextAction: {
              kind:
                | "continue_editing"
                | "fill_required_field"
                | "fill_required_localized_field"
                | "fill_required_shared_field"
                | "add_locale"
                | "publish_locale"
                | "resolve_route_collision"
                | "request_review"
                | "open_review"
                | "view_public_page";
              locale: string | null;
              params: Record<string, string | number | boolean | null>;
              target:
                "editor" | "field" | "locale" | "route" | "review" | "publish";
            };
            publicUrl: string | null;
            published: boolean;
            reviewRequestId: string | null;
            state:
              | "draft"
              | "needs_work"
              | "ready"
              | "in_review"
              | "live"
              | "live_with_changes"
              | "missing";
            warnings: Array<{
              code:
                | "required_field_missing"
                | "required_localized_field_missing"
                | "required_shared_field_missing"
                | "body_required"
                | "seo_title_required"
                | "seo_description_required"
                | "asset_alt_required"
                | "asset_caption_required"
                | "collection_schema_invalid"
                | "data_only_required_field_missing"
                | "locale_missing"
                | "locale_not_configured"
                | "primary_locale_missing"
                | "default_locale_unknown"
                | "fallback_not_configured"
                | "locale_parent_missing"
                | "locale_public_projection_missing"
                | "locale_public_route_missing"
                | "locale_slug_missing"
                | "locale_switch_target_missing"
                | "route_missing"
                | "route_collision"
                | "route_reserved"
                | "route_invalid"
                | "route_parent_not_public"
                | "route_descendant_collision"
                | "route_descendant_rebuild_failed"
                | "route_cycle_detected"
                | "route_depth_exceeded"
                | "route_slug_unchanged_noop"
                | "review_request_stale"
                | "review_preview_stale"
                | "review_preview_missing"
                | "review_not_authorized"
                | "review_already_closed"
                | "review_publish_blocked"
                | "review_locale_mismatch"
                | "review_version_hash_mismatch"
                | "permission_publish_missing"
                | "permission_review_missing"
                | "permission_archive_missing"
                | "permission_restore_missing"
                | "permission_agent_scope_missing"
                | "permission_member_inactive"
                | "permission_api_key_revoked"
                | "permission_role_not_allowed"
                | "agent_run_missing"
                | "agent_run_not_owned"
                | "agent_run_closed"
                | "agent_publish_requires_permission"
                | "agent_archive_requires_permission"
                | "agent_restore_requires_permission"
                | "agent_review_required"
                | "agent_operation_not_supported"
                | "asset_missing"
                | "asset_not_public"
                | "asset_policy_blocked"
                | "asset_metadata_stale"
                | "asset_alt_missing"
                | "asset_caption_missing"
                | "asset_ref_rebuild_failed"
                | "asset_upload_pending"
                | "relation_target_missing"
                | "relation_target_not_public"
                | "relation_locale_missing"
                | "relation_collection_invalid"
                | "relation_cycle_detected"
                | "relation_validation_failed"
                | "projection_public_entry_missing"
                | "projection_public_route_missing"
                | "projection_revision_missing"
                | "projection_revision_locale_missing"
                | "projection_rebuild_failed"
                | "projection_route_mismatch"
                | "projection_asset_ref_mismatch"
                | "projection_cache_tags_missing"
                | "revalidation_pending"
                | "revalidation_failed"
                | "revalidation_delivery_missing"
                | "revalidation_adapter_unconfigured"
                | "revalidation_cache_tag_missing"
                | "revalidation_event_stale"
                | "settings_missing"
                | "collection_missing"
                | "entry_missing"
                | "entry_archived"
                | "entry_collection_mismatch"
                | "draft_version_conflict"
                | "draft_hash_mismatch"
                | "confirmation_missing"
                | "confirmation_expired"
                | "confirmation_mismatch";
              diagnosticId: string | null;
              fieldPath: string | null;
              locale: string | null;
              messageParams: Record<string, string | number | boolean | null>;
              severity: "blocker" | "warning" | "info";
            }>;
          }>;
          primaryLocale: string;
          updatedAt: number;
        },
        Name
      >;
      getSharedBodyHead: FunctionReference<
        "query",
        "internal",
        {
          _trustedCaller?:
            | { kind: "anonymous"; subject: "system:anonymous" }
            | {
                email?: string;
                emailVerified?: boolean;
                kind: "user";
                name?: string;
                subject: string;
                userId: string;
              }
            | {
                clientId: string;
                issuer: string;
                kind: "mcp";
                scopes: Array<string>;
                subject: string;
                userId: string;
              }
            | { deployId: string; kind: "deploy"; subject: string };
          entryId: string;
          locale: string;
        },
        {
          epoch: string;
          policyRevision: string;
          protocolVersion?: 1;
          schemaRevision: string;
          version: number;
        },
        Name
      >;
      getStudioOverview: FunctionReference<
        "query",
        "internal",
        { locale: string },
        {
          recentPublished: Array<{
            _can?: Record<string, boolean>;
            blockingIssueCount: number;
            collection: string;
            collectionLabel: string | Record<string, string>;
            entryId: string;
            missingTranslationLocales: Array<string>;
            nextAction: string;
            path: string;
            publicState:
              "public" | "draft_only" | "needs_attention" | "data_only";
            publishedAt: number | null;
            status: "draft" | "published" | "archived";
            title: string;
            updatedAt: number;
          }>;
          revalidationJobs: Array<{
            attempts: number;
            createdAt: number;
            id: string;
            lastError: string | null;
            paths: Array<string>;
            status: "pending" | "delivering" | "delivered" | "failed";
            updatedAt: number;
          }>;
        },
        Name
      >;
      getTranslationReview: FunctionReference<
        "query",
        "internal",
        { entryId: string; targetLocale: string },
        {
          _can: { edit: boolean };
          changedFields: Array<string>;
          changedTargetFields: Array<string>;
          entryId: string;
          reason:
            | "unreviewed"
            | "source-changed"
            | "target-changed"
            | "source-missing"
            | null;
          reviewId: string | null;
          reviewedAt: number | null;
          reviewedBy: string | null;
          reviewedSource: {
            bodyMdc: string;
            shared: Record<
              string,
              _GinkoCmsJsonDepth8
            >;
            slug: string | null;
            values: Record<
              string,
              _GinkoCmsJsonDepth8
            >;
          } | null;
          sharedVersion: number;
          source: {
            bodyMdc: string;
            shared: Record<
              string,
              _GinkoCmsJsonDepth8
            >;
            slug: string | null;
            values: Record<
              string,
              _GinkoCmsJsonDepth8
            >;
          } | null;
          sourceDraftId: string | null;
          sourceLocale: string | null;
          sourceVersion: number | null;
          status: "unknown" | "independent" | "needs-review" | "reviewed";
          target: {
            bodyMdc: string;
            shared: Record<
              string,
              _GinkoCmsJsonDepth8
            >;
            slug: string | null;
            values: Record<
              string,
              _GinkoCmsJsonDepth8
            >;
          };
          targetDraftId: string;
          targetLocale: string;
          targetVersion: number;
        },
        Name
      >;
      getVersionDiff: FunctionReference<
        "query",
        "internal",
        { leftVersionId: string; rightVersionId: string },
        {
          changes: Array<{
            field: string;
            left:
              | null
              | boolean
              | number
              | string
              | Array<
                  _GinkoCmsJsonDepth7
                >
              | Record<
                  string,
                  _GinkoCmsJsonDepth7
                >
              | null;
            right:
              | null
              | boolean
              | number
              | string
              | Array<
                  _GinkoCmsJsonDepth7
                >
              | Record<
                  string,
                  _GinkoCmsJsonDepth7
                >
              | null;
          }>;
          leftVersionId: string;
          rightVersionId: string;
        },
        Name
      >;
      getVersionSnapshot: FunctionReference<
        "query",
        "internal",
        { locale?: string; versionId: string },
        {
          _id: string;
          action: string;
          createdAt: number;
          message: string | null;
          snapshot: {
            baseSlug: string;
            locale: {
              path: string;
              slug: string | null;
              values: Record<
                string,
                _GinkoCmsJsonDepth8
              > | null;
            } | null;
            shared: Record<
              string,
              _GinkoCmsJsonDepth8
            >;
          };
          version: number;
        },
        Name
      >;
      listActivity: FunctionReference<
        "query",
        "internal",
        {
          filter?:
            | { entryId: string; kind: "content" }
            | { collection: string; kind: "collection" }
            | { appIdentityId: string; kind: "actor" }
            | { kind: "operation"; operationKind: string }
            | {
                kind: "result";
                outcome: "applied" | "failed" | "blocked" | "stale";
              }
            | { from: number; kind: "time"; to: number };
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
        },
        {
          continueCursor: string;
          isDone: boolean;
          page: Array<{
            _id: string;
            actorLabel: string | null;
            appIdentityId: string;
            collection: string | null;
            collectionLabel?: string | null;
            createdAt: number;
            displaySummary: string;
            entryId: string | null;
            entrySlug?: string | null;
            kind: string;
            locale: string | null;
            outcome: "applied" | "failed" | "blocked" | "stale";
          }>;
        },
        Name
      >;
      listEntriesForStudio: FunctionReference<
        "query",
        "internal",
        {
          _trustedCaller?:
            | { kind: "anonymous"; subject: "system:anonymous" }
            | {
                email?: string;
                emailVerified?: boolean;
                kind: "user";
                name?: string;
                subject: string;
                userId: string;
              }
            | {
                clientId: string;
                issuer: string;
                kind: "mcp";
                scopes: Array<string>;
                subject: string;
                userId: string;
              }
            | { deployId: string; kind: "deploy"; subject: string };
          collection: string;
          locale: string;
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
          parentEntryId: string | null;
          query?: string;
          status?: "draft" | "published" | "archived";
        },
        {
          continueCursor: string;
          isDone: boolean;
          page: Array<{
            _can?: Record<string, boolean>;
            _id: string;
            baseSlug: string;
            collection: string;
            createdAt: number;
            data: Record<
              string,
              _GinkoCmsJsonDepth8
            >;
            dirtyLocales: Array<string>;
            draftVersion: number;
            locale: string;
            localeSummaries: Array<{
              draftExists: boolean;
              draftPath: string;
              locale: string;
              published: boolean;
              publishedPath: string | null;
              updatedAt: number;
            }>;
            nodeKind: "page" | "folder" | "group" | "section";
            orderRank: string;
            parentEntryId: string | null;
            path: string;
            publishedAt: number | null;
            stableId: string | null;
            status: "draft" | "published" | "archived";
            title: string;
            updatedAt: number;
          }>;
        },
        Name
      >;
      listEntrySummaries: FunctionReference<
        "query",
        "internal",
        {
          collection: string;
          locale: string;
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
          query?: string;
          status?: "draft" | "published" | "archived";
          workState?:
            "all" | "changed" | "needs_attention" | "missing_translation";
        },
        {
          continueCursor: string;
          isDone: boolean;
          page: Array<{
            _can?: Record<string, boolean>;
            _id: string;
            blockingIssueCount: number;
            collection: string;
            collectionLabel: string | Record<string, string>;
            draftChangedSincePublish: boolean;
            entryId: string;
            localeReadiness: Array<{
              changed: boolean;
              draftPath: string;
              locale: string;
              published: boolean;
              publishedPath: string | null;
              state: "public" | "draft_only" | "changed";
            }>;
            missingTranslationLocales: Array<string>;
            nextAction: string;
            nodeKind: "page" | "folder" | "group" | "section";
            parentEntryId: string | null;
            path: string;
            publicState:
              "public" | "draft_only" | "needs_attention" | "data_only";
            publishedAt: number | null;
            routeMode: "route" | "none";
            slug: string;
            status: "draft" | "published" | "archived";
            title: string;
            updatedAt: number;
            workflowSummary: {
              collection: string;
              entryId: string;
              issueCounts: { blocker: number; info: number; warning: number };
              missingLocales: Array<string>;
              nextAction: {
                kind:
                  | "continue_editing"
                  | "fill_required_field"
                  | "fill_required_localized_field"
                  | "fill_required_shared_field"
                  | "add_locale"
                  | "publish_locale"
                  | "resolve_route_collision"
                  | "request_review"
                  | "open_review"
                  | "view_public_page";
                locale: string | null;
                params: Record<string, string | number | boolean | null>;
                target:
                  | "editor"
                  | "field"
                  | "locale"
                  | "route"
                  | "review"
                  | "publish";
              };
              primaryLocale: string;
              publishedLocales: Array<string>;
              readinessStatesByLocale: Record<
                string,
                | "draft"
                | "needs_work"
                | "ready"
                | "in_review"
                | "live"
                | "live_with_changes"
                | "missing"
              >;
              workStatesByLocale: Record<
                string,
                | "missing_translation"
                | "blocked"
                | "public"
                | "changed"
                | "draft"
              >;
            };
          }>;
        },
        Name
      >;
      listPublishRouteImpactPage: FunctionReference<
        "query",
        "internal",
        {
          cursor?: string | null;
          entryId: string;
          expectedRouteGeneration: number;
          expectedVersion: number;
          limit?: number;
          locale: string;
        },
        {
          changes: Array<{
            after: string | boolean | null;
            before: string | boolean | null;
            entryId?: string;
            kind: "route" | "redirect" | "sitemap" | "search" | "nav" | "seo";
            label: string;
            locale: string;
            scope?: "current_entry" | "descendant";
          }>;
          collection: string;
          continueCursor: string | null;
          draftVersion: number;
          entryId: string;
          isDone: boolean;
          locale: string;
          routeGeneration: number;
        },
        Name
      >;
      listRedirects: FunctionReference<
        "query",
        "internal",
        {
          collection: string;
          locale: string;
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
          state: "active" | "retired";
        },
        {
          continueCursor: string | null;
          isDone: boolean;
          page: Array<{
            collection: string;
            createdAt: number;
            createdBy: string;
            fromPath: string;
            id: string;
            kind: "exact" | "prefix";
            locale: string;
            operationId: string;
            retiredAt: number | null;
            retiredBy: string | null;
            source: "manual" | "publish" | "import";
            state: "active" | "retired";
            statusCode: number;
            targetEntryId: string;
            targetPath: string | null;
            targetReachable: boolean;
            updatedAt: number;
          }>;
        },
        Name
      >;
      listStudioWorkQueue: FunctionReference<
        "query",
        "internal",
        {
          locale: string;
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
        },
        {
          continueCursor: string;
          isDone: boolean;
          page: Array<{
            entry: {
              _can?: Record<string, boolean>;
              _id: string;
              blockingIssueCount: number;
              collection: string;
              collectionLabel: string | Record<string, string>;
              draftChangedSincePublish: boolean;
              entryId: string;
              localeReadiness: Array<{
                changed: boolean;
                draftPath: string;
                locale: string;
                published: boolean;
                publishedPath: string | null;
                state: "public" | "draft_only" | "changed";
              }>;
              missingTranslationLocales: Array<string>;
              nextAction: string;
              nodeKind: "page" | "folder" | "group" | "section";
              parentEntryId: string | null;
              path: string;
              publicState:
                "public" | "draft_only" | "needs_attention" | "data_only";
              publishedAt: number | null;
              routeMode: "route" | "none";
              slug: string;
              status: "draft" | "published" | "archived";
              title: string;
              updatedAt: number;
              workflowSummary: {
                collection: string;
                entryId: string;
                issueCounts: { blocker: number; info: number; warning: number };
                missingLocales: Array<string>;
                nextAction: {
                  kind:
                    | "continue_editing"
                    | "fill_required_field"
                    | "fill_required_localized_field"
                    | "fill_required_shared_field"
                    | "add_locale"
                    | "publish_locale"
                    | "resolve_route_collision"
                    | "request_review"
                    | "open_review"
                    | "view_public_page";
                  locale: string | null;
                  params: Record<string, string | number | boolean | null>;
                  target:
                    | "editor"
                    | "field"
                    | "locale"
                    | "route"
                    | "review"
                    | "publish";
                };
                primaryLocale: string;
                publishedLocales: Array<string>;
                readinessStatesByLocale: Record<
                  string,
                  | "draft"
                  | "needs_work"
                  | "ready"
                  | "in_review"
                  | "live"
                  | "live_with_changes"
                  | "missing"
                >;
                workStatesByLocale: Record<
                  string,
                  | "missing_translation"
                  | "blocked"
                  | "public"
                  | "changed"
                  | "draft"
                >;
              };
            };
            queueKinds: Array<
              "changed" | "needs_attention" | "missing_translation"
            >;
          }>;
        },
        Name
      >;
      listVersions: FunctionReference<
        "query",
        "internal",
        {
          entryId: string;
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
        },
        {
          continueCursor: string;
          isDone: boolean;
          page: Array<{
            _id: string;
            action: string;
            createdAt: number;
            createdBy: string;
            displayAction:
              | "published"
              | "restoredPublished"
              | "restoredDraft"
              | "unpublished"
              | "archived"
              | "checkpoint"
              | "routeUpdated";
            isCurrentPublished: boolean;
            message: string | null;
            publishedLocales: Array<string>;
            version: number;
          }>;
        },
        Name
      >;
      mcpPreviewPublishEntry: FunctionReference<
        "mutation",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          _trustedCaller?:
            | { kind: "anonymous"; subject: "system:anonymous" }
            | {
                email?: string;
                emailVerified?: boolean;
                kind: "user";
                name?: string;
                subject: string;
                userId: string;
              }
            | {
                clientId: string;
                issuer: string;
                kind: "mcp";
                scopes: Array<string>;
                subject: string;
                userId: string;
              }
            | { deployId: string; kind: "deploy"; subject: string };
          agentRunId: string;
          entryId: string;
          expectedVersion: number;
          locales: Array<string>;
          message?: string;
        },
        {
          allowed: boolean;
          blockers: Array<{
            code: string;
            count?: number;
            details?: any;
            message: string;
            status?: "blocked" | "stale";
          }>;
          confirm: any;
          confirmation: { expiresAt: number; token: string } | null;
          details: any;
          effects: Array<{
            count?: number | null;
            countLabel?: string;
            kind: string;
            minimumCount?: number;
            summary: string;
          }>;
          summary: string;
          version: any;
          warnings: Array<{
            code: string;
            count?: number;
            details?: any;
            message: string;
            status?: "blocked" | "stale";
          }>;
        },
        Name
      >;
      mcpSaveEntryDraft: FunctionReference<
        "mutation",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          _trustedCaller?:
            | { kind: "anonymous"; subject: "system:anonymous" }
            | {
                email?: string;
                emailVerified?: boolean;
                kind: "user";
                name?: string;
                subject: string;
                userId: string;
              }
            | {
                clientId: string;
                issuer: string;
                kind: "mcp";
                scopes: Array<string>;
                subject: string;
                userId: string;
              }
            | { deployId: string; kind: "deploy"; subject: string };
          agentRunId: string;
          concurrency?: {
            base: {
              locales?: Record<
                string,
                {
                  bodyMdc?: string | null;
                  slug?: string | null;
                  values?: Record<
                    string,
                    _GinkoCmsJsonDepth8
                  >;
                }
              >;
              shared?: {
                nodeKind?: "page" | "folder" | "group" | "section";
                orderRank?: string | null;
                parentEntryId?: string | null;
                shared?: Record<
                  string,
                  _GinkoCmsJsonDepth8
                >;
                slug?: string | null;
              };
            };
            localeDraftIds: Record<string, string>;
            requestId: string;
          };
          entryId: string;
          expectedDraftVersion: number;
          patch: {
            locales?: Record<
              string,
              {
                bodyMdc?: string | null;
                slug?: string | null;
                values?: Record<
                  string,
                  _GinkoCmsJsonDepth8
                >;
              }
            >;
            shared?: {
              nodeKind?: "page" | "folder" | "group" | "section";
              orderRank?: string | null;
              parentEntryId?: string | null;
              shared?: Record<
                string,
                _GinkoCmsJsonDepth8
              >;
              slug?: string | null;
            };
          };
        },
        { dirtyLocales: Array<string>; draftVersion: number },
        Name
      >;
      openSharedBody: FunctionReference<
        "mutation",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          _trustedCaller?:
            | { kind: "anonymous"; subject: "system:anonymous" }
            | {
                email?: string;
                emailVerified?: boolean;
                kind: "user";
                name?: string;
                subject: string;
                userId: string;
              }
            | {
                clientId: string;
                issuer: string;
                kind: "mcp";
                scopes: Array<string>;
                subject: string;
                userId: string;
              }
            | { deployId: string; kind: "deploy"; subject: string };
          entryId: string;
          locale: string;
        },
        | { available: false; reason: "policy" | "source" }
        | {
            available: true;
            clientPrefix: string;
            snapshot: {
              document: string;
              epoch: string;
              policyRevision: string;
              protocolVersion?: 1;
              schemaRevision: string;
              version: number;
            };
          },
        Name
      >;
      permanentlyDeleteEntryOperationExecute: FunctionReference<
        "mutation",
        "internal",
        {
          _confirmationToken?: string;
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          confirmationPhrase: string;
          entryId: string;
        },
        | {
            status: "applied";
            value: {
              activityRecordsRetainedAtDeletion: number;
              alreadyDeleted: boolean;
              collection: string;
              deleted: boolean;
              entryId: string;
              legalActivityRecordsRetained: number;
              stableId: string;
              standardActivityRecordsRetainedAtDeletion: number;
            };
          }
        | { code: string; details: any; message: string; status: "blocked" }
        | { code: string; details: any; message: string; status: "stale" },
        Name
      >;
      previewArchiveEntryOperation: FunctionReference<
        "mutation",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          entryId: string;
        },
        {
          allowed: boolean;
          blockers: Array<{
            code: string;
            count?: number;
            details?: any;
            message: string;
            status?: "blocked" | "stale";
          }>;
          confirm: any;
          confirmation: { expiresAt: number; token: string } | null;
          details: any;
          effects: Array<{
            count?: number | null;
            countLabel?: string;
            kind: string;
            minimumCount?: number;
            summary: string;
          }>;
          summary: string;
          version: any;
          warnings: Array<{
            code: string;
            count?: number;
            details?: any;
            message: string;
            status?: "blocked" | "stale";
          }>;
        },
        Name
      >;
      previewPermanentlyDeleteEntryOperation: FunctionReference<
        "mutation",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          confirmationPhrase: string;
          entryId: string;
        },
        {
          allowed: boolean;
          blockers: Array<{
            code: string;
            count?: number;
            details?: any;
            message: string;
            status?: "blocked" | "stale";
          }>;
          confirm: any;
          confirmation: { expiresAt: number; token: string } | null;
          details: any;
          effects: Array<{
            count?: number | null;
            countLabel?: string;
            kind: string;
            minimumCount?: number;
            summary: string;
          }>;
          summary: string;
          version: any;
          warnings: Array<{
            code: string;
            count?: number;
            details?: any;
            message: string;
            status?: "blocked" | "stale";
          }>;
        },
        Name
      >;
      previewPublishEntryOperation: FunctionReference<
        "mutation",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          entryId: string;
          expectedVersion: number;
          locales: Array<string>;
          message?: string;
        },
        {
          allowed: boolean;
          blockers: Array<{
            code: string;
            count?: number;
            details?: any;
            message: string;
            status?: "blocked" | "stale";
          }>;
          confirm: any;
          confirmation: { expiresAt: number; token: string } | null;
          details: any;
          effects: Array<{
            count?: number | null;
            countLabel?: string;
            kind: string;
            minimumCount?: number;
            summary: string;
          }>;
          summary: string;
          version: any;
          warnings: Array<{
            code: string;
            count?: number;
            details?: any;
            message: string;
            status?: "blocked" | "stale";
          }>;
        },
        Name
      >;
      previewReorderEntryOperation: FunctionReference<
        "mutation",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          afterEntryId?: string;
          beforeEntryId?: string;
          entryId: string;
          expectedDraftVersion: number;
          parentEntryId?: string;
        },
        {
          allowed: boolean;
          blockers: Array<{
            code: string;
            count?: number;
            details?: any;
            message: string;
            status?: "blocked" | "stale";
          }>;
          confirm: any;
          confirmation: { expiresAt: number; token: string } | null;
          details: any;
          effects: Array<{
            count?: number | null;
            countLabel?: string;
            kind: string;
            minimumCount?: number;
            summary: string;
          }>;
          summary: string;
          version: any;
          warnings: Array<{
            code: string;
            count?: number;
            details?: any;
            message: string;
            status?: "blocked" | "stale";
          }>;
        },
        Name
      >;
      previewReparentEntryOperation: FunctionReference<
        "mutation",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          afterEntryId?: string;
          beforeEntryId?: string;
          entryId: string;
          expectedDraftVersion: number;
          parentEntryId?: string;
        },
        {
          allowed: boolean;
          blockers: Array<{
            code: string;
            count?: number;
            details?: any;
            message: string;
            status?: "blocked" | "stale";
          }>;
          confirm: any;
          confirmation: { expiresAt: number; token: string } | null;
          details: any;
          effects: Array<{
            count?: number | null;
            countLabel?: string;
            kind: string;
            minimumCount?: number;
            summary: string;
          }>;
          summary: string;
          version: any;
          warnings: Array<{
            code: string;
            count?: number;
            details?: any;
            message: string;
            status?: "blocked" | "stale";
          }>;
        },
        Name
      >;
      previewRestoreEntryOperation: FunctionReference<
        "mutation",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          entryId: string;
        },
        {
          allowed: boolean;
          blockers: Array<{
            code: string;
            count?: number;
            details?: any;
            message: string;
            status?: "blocked" | "stale";
          }>;
          confirm: any;
          confirmation: { expiresAt: number; token: string } | null;
          details: any;
          effects: Array<{
            count?: number | null;
            countLabel?: string;
            kind: string;
            minimumCount?: number;
            summary: string;
          }>;
          summary: string;
          version: any;
          warnings: Array<{
            code: string;
            count?: number;
            details?: any;
            message: string;
            status?: "blocked" | "stale";
          }>;
        },
        Name
      >;
      previewRetireRedirectOperation: FunctionReference<
        "mutation",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          redirectId: string;
        },
        {
          allowed: boolean;
          blockers: Array<{
            code: string;
            count?: number;
            details?: any;
            message: string;
            status?: "blocked" | "stale";
          }>;
          confirm: any;
          confirmation: { expiresAt: number; token: string } | null;
          details: any;
          effects: Array<{
            count?: number | null;
            countLabel?: string;
            kind: string;
            minimumCount?: number;
            summary: string;
          }>;
          summary: string;
          version: any;
          warnings: Array<{
            code: string;
            count?: number;
            details?: any;
            message: string;
            status?: "blocked" | "stale";
          }>;
        },
        Name
      >;
      previewRevertDraftToPublishedOperation: FunctionReference<
        "mutation",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          entryId: string;
        },
        {
          allowed: boolean;
          blockers: Array<{
            code: string;
            count?: number;
            details?: any;
            message: string;
            status?: "blocked" | "stale";
          }>;
          confirm: any;
          confirmation: { expiresAt: number; token: string } | null;
          details: any;
          effects: Array<{
            count?: number | null;
            countLabel?: string;
            kind: string;
            minimumCount?: number;
            summary: string;
          }>;
          summary: string;
          version: any;
          warnings: Array<{
            code: string;
            count?: number;
            details?: any;
            message: string;
            status?: "blocked" | "stale";
          }>;
        },
        Name
      >;
      previewRollbackVersionOperation: FunctionReference<
        "mutation",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          entryId: string;
          publish?: boolean;
          versionId: string;
        },
        {
          allowed: boolean;
          blockers: Array<{
            code: string;
            count?: number;
            details?: any;
            message: string;
            status?: "blocked" | "stale";
          }>;
          confirm: any;
          confirmation: { expiresAt: number; token: string } | null;
          details: any;
          effects: Array<{
            count?: number | null;
            countLabel?: string;
            kind: string;
            minimumCount?: number;
            summary: string;
          }>;
          summary: string;
          version: any;
          warnings: Array<{
            code: string;
            count?: number;
            details?: any;
            message: string;
            status?: "blocked" | "stale";
          }>;
        },
        Name
      >;
      previewUnpublishEntryOperation: FunctionReference<
        "mutation",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          entryId: string;
          locales: Array<string>;
        },
        {
          allowed: boolean;
          blockers: Array<{
            code: string;
            count?: number;
            details?: any;
            message: string;
            status?: "blocked" | "stale";
          }>;
          confirm: any;
          confirmation: { expiresAt: number; token: string } | null;
          details: any;
          effects: Array<{
            count?: number | null;
            countLabel?: string;
            kind: string;
            minimumCount?: number;
            summary: string;
          }>;
          summary: string;
          version: any;
          warnings: Array<{
            code: string;
            count?: number;
            details?: any;
            message: string;
            status?: "blocked" | "stale";
          }>;
        },
        Name
      >;
      publishEntryOperationExecute: FunctionReference<
        "mutation",
        "internal",
        {
          _confirmationToken?: string;
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          entryId: string;
          expectedVersion: number;
          locales: Array<string>;
          message?: string;
        },
        | {
            status: "applied";
            value: {
              dirtyLocales: Array<string>;
              draftVersion: number;
              versionId: string;
            };
          }
        | { code: string; details: any; message: string; status: "blocked" }
        | { code: string; details: any; message: string; status: "stale" },
        Name
      >;
      pullSharedBody: FunctionReference<
        "query",
        "internal",
        {
          _trustedCaller?:
            | { kind: "anonymous"; subject: "system:anonymous" }
            | {
                email?: string;
                emailVerified?: boolean;
                kind: "user";
                name?: string;
                subject: string;
                userId: string;
              }
            | {
                clientId: string;
                issuer: string;
                kind: "mcp";
                scopes: Array<string>;
                subject: string;
                userId: string;
              }
            | { deployId: string; kind: "deploy"; subject: string };
          entryId: string;
          epoch: string;
          locale: string;
          policyRevision: string;
          protocolVersion?: 1;
          schemaRevision: string;
          version: number;
        },
        | {
            status: "ok";
            update: {
              clientIds: Array<string>;
              epoch: string;
              fromVersion: number;
              policyRevision: string;
              protocolVersion?: 1;
              schemaRevision: string;
              steps: Array<string>;
              version: number;
            };
          }
        | {
            head: {
              epoch: string;
              policyRevision: string;
              protocolVersion?: 1;
              schemaRevision: string;
              version: number;
            };
            reason: "epoch" | "schema" | "policy" | "history";
            status: "stale";
          },
        Name
      >;
      pushSharedBody: FunctionReference<
        "mutation",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          _trustedCaller?:
            | { kind: "anonymous"; subject: "system:anonymous" }
            | {
                email?: string;
                emailVerified?: boolean;
                kind: "user";
                name?: string;
                subject: string;
                userId: string;
              }
            | {
                clientId: string;
                issuer: string;
                kind: "mcp";
                scopes: Array<string>;
                subject: string;
                userId: string;
              }
            | { deployId: string; kind: "deploy"; subject: string };
          clientId: string;
          entryId: string;
          epoch: string;
          locale: string;
          policyRevision: string;
          protocolVersion?: 1;
          schemaRevision: string;
          steps: Array<string>;
          version: number;
        },
        | {
            status: "ok";
            update: {
              clientIds: Array<string>;
              epoch: string;
              fromVersion: number;
              policyRevision: string;
              protocolVersion?: 1;
              schemaRevision: string;
              steps: Array<string>;
              version: number;
            };
          }
        | {
            head: {
              epoch: string;
              policyRevision: string;
              protocolVersion?: 1;
              schemaRevision: string;
              version: number;
            };
            reason: "epoch" | "schema" | "policy" | "history";
            status: "stale";
          },
        Name
      >;
      reorderEntryOperationExecute: FunctionReference<
        "mutation",
        "internal",
        {
          _confirmationToken?: string;
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          afterEntryId?: string;
          beforeEntryId?: string;
          entryId: string;
          expectedDraftVersion: number;
          parentEntryId?: string;
        },
        | {
            status: "applied";
            value: {
              draftVersion: number;
              orderRank: string;
              parentEntryId: string | null;
            };
          }
        | { code: string; details: any; message: string; status: "blocked" }
        | { code: string; details: any; message: string; status: "stale" },
        Name
      >;
      reparentEntryOperationExecute: FunctionReference<
        "mutation",
        "internal",
        {
          _confirmationToken?: string;
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          afterEntryId?: string;
          beforeEntryId?: string;
          entryId: string;
          expectedDraftVersion: number;
          parentEntryId?: string;
        },
        | {
            status: "applied";
            value: {
              draftVersion: number;
              orderRank: string;
              parentEntryId: string | null;
            };
          }
        | { code: string; details: any; message: string; status: "blocked" }
        | { code: string; details: any; message: string; status: "stale" },
        Name
      >;
      resolveRelationEntries: FunctionReference<
        "query",
        "internal",
        {
          _trustedCaller?:
            | { kind: "anonymous"; subject: "system:anonymous" }
            | {
                email?: string;
                emailVerified?: boolean;
                kind: "user";
                name?: string;
                subject: string;
                userId: string;
              }
            | {
                clientId: string;
                issuer: string;
                kind: "mcp";
                scopes: Array<string>;
                subject: string;
                userId: string;
              }
            | { deployId: string; kind: "deploy"; subject: string };
          collection: string;
          locale: string;
          stableIds: Array<string>;
        },
        Array<{ _id: string; slug: string; stableId: string; title: string }>,
        Name
      >;
      restoreEntryOperationExecute: FunctionReference<
        "mutation",
        "internal",
        {
          _confirmationToken?: string;
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          entryId: string;
        },
        | { status: "applied"; value: null }
        | { code: string; details: any; message: string; status: "blocked" }
        | { code: string; details: any; message: string; status: "stale" },
        Name
      >;
      retireRedirectOperationExecute: FunctionReference<
        "mutation",
        "internal",
        {
          _confirmationToken?: string;
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          redirectId: string;
        },
        | {
            status: "applied";
            value: {
              fromPath: string;
              redirectId: string;
              retiredAt: number;
              targetPath: string | null;
            };
          }
        | { code: string; details: any; message: string; status: "blocked" }
        | { code: string; details: any; message: string; status: "stale" },
        Name
      >;
      revertDraftToPublishedOperationExecute: FunctionReference<
        "mutation",
        "internal",
        {
          _confirmationToken?: string;
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          entryId: string;
        },
        | {
            status: "applied";
            value: { dirtyLocales: Array<string>; draftVersion: number };
          }
        | { code: string; details: any; message: string; status: "blocked" }
        | { code: string; details: any; message: string; status: "stale" },
        Name
      >;
      rollbackVersionOperationExecute: FunctionReference<
        "mutation",
        "internal",
        {
          _confirmationToken?: string;
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          entryId: string;
          publish?: boolean;
          versionId: string;
        },
        | { status: "applied"; value: { versionId: string } }
        | { code: string; details: any; message: string; status: "blocked" }
        | { code: string; details: any; message: string; status: "stale" },
        Name
      >;
      saveEntryDraft: FunctionReference<
        "mutation",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          concurrency?: {
            base: {
              locales?: Record<
                string,
                {
                  bodyMdc?: string | null;
                  slug?: string | null;
                  values?: Record<
                    string,
                    _GinkoCmsJsonDepth8
                  >;
                }
              >;
              shared?: {
                nodeKind?: "page" | "folder" | "group" | "section";
                orderRank?: string | null;
                parentEntryId?: string | null;
                shared?: Record<
                  string,
                  _GinkoCmsJsonDepth8
                >;
                slug?: string | null;
              };
            };
            localeDraftIds: Record<string, string>;
            requestId: string;
          };
          entryId: string;
          expectedDraftVersion: number;
          patch: {
            locales?: Record<
              string,
              {
                bodyMdc?: string | null;
                slug?: string | null;
                values?: Record<
                  string,
                  _GinkoCmsJsonDepth8
                >;
              }
            >;
            shared?: {
              nodeKind?: "page" | "folder" | "group" | "section";
              orderRank?: string | null;
              parentEntryId?: string | null;
              shared?: Record<
                string,
                _GinkoCmsJsonDepth8
              >;
              slug?: string | null;
            };
          };
        },
        { dirtyLocales: Array<string>; draftVersion: number },
        Name
      >;
      setTranslationSource: FunctionReference<
        "mutation",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          entryId: string;
          expectedReviewId: string | null;
          expectedSharedVersion: number;
          expectedTargetDraftId: string;
          expectedTargetVersion: number;
          sourceLocale: string | null;
          targetLocale: string;
        },
        string,
        Name
      >;
      unpublishEntryOperationExecute: FunctionReference<
        "mutation",
        "internal",
        {
          _confirmationToken?: string;
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          entryId: string;
          locales: Array<string>;
        },
        | { status: "applied"; value: null }
        | { code: string; details: any; message: string; status: "blocked" }
        | { code: string; details: any; message: string; status: "stale" },
        Name
      >;
    };
    entries: {
      activity: {
        getEntryActivity: FunctionReference<
          "query",
          "internal",
          {
            entryId: string;
            paginationOpts: {
              cursor: string | null;
              endCursor?: string | null;
              id?: number;
              maximumBytesRead?: number;
              maximumRowsRead?: number;
              numItems: number;
            };
          },
          {
            continueCursor: string;
            isDone: boolean;
            page: Array<{
              _id: string;
              appIdentityId: string;
              createdAt: number;
              detail:
                | null
                | boolean
                | number
                | string
                | Array<
                    _GinkoCmsJsonDepth7
                  >
                | Record<
                    string,
                    _GinkoCmsJsonDepth7
                  >
                | null;
              displaySummary: string;
              kind: string;
              locale: string | null;
              outcome: "applied" | "failed" | "blocked" | "stale";
              summary: string;
            }>;
          },
          Name
        >;
        listActivity: FunctionReference<
          "query",
          "internal",
          {
            filter?:
              | { entryId: string; kind: "content" }
              | { collection: string; kind: "collection" }
              | { appIdentityId: string; kind: "actor" }
              | { kind: "operation"; operationKind: string }
              | {
                  kind: "result";
                  outcome: "applied" | "failed" | "blocked" | "stale";
                }
              | { from: number; kind: "time"; to: number };
            paginationOpts: {
              cursor: string | null;
              endCursor?: string | null;
              id?: number;
              maximumBytesRead?: number;
              maximumRowsRead?: number;
              numItems: number;
            };
          },
          {
            continueCursor: string;
            isDone: boolean;
            page: Array<{
              _id: string;
              actorLabel: string | null;
              appIdentityId: string;
              collection: string | null;
              collectionLabel?: string | null;
              createdAt: number;
              displaySummary: string;
              entryId: string | null;
              entrySlug?: string | null;
              kind: string;
              locale: string | null;
              outcome: "applied" | "failed" | "blocked" | "stale";
            }>;
          },
          Name
        >;
      };
      collaboration: {
        getSharedBodyHead: FunctionReference<
          "query",
          "internal",
          {
            _trustedCaller?:
              | { kind: "anonymous"; subject: "system:anonymous" }
              | {
                  email?: string;
                  emailVerified?: boolean;
                  kind: "user";
                  name?: string;
                  subject: string;
                  userId: string;
                }
              | {
                  clientId: string;
                  issuer: string;
                  kind: "mcp";
                  scopes: Array<string>;
                  subject: string;
                  userId: string;
                }
              | { deployId: string; kind: "deploy"; subject: string };
            entryId: string;
            locale: string;
          },
          {
            epoch: string;
            policyRevision: string;
            protocolVersion?: 1;
            schemaRevision: string;
            version: number;
          },
          Name
        >;
        openSharedBody: FunctionReference<
          "mutation",
          "internal",
          {
            _expectedContentHash?: string;
            _expectedPresentationHash?: string;
            _trustedCaller?:
              | { kind: "anonymous"; subject: "system:anonymous" }
              | {
                  email?: string;
                  emailVerified?: boolean;
                  kind: "user";
                  name?: string;
                  subject: string;
                  userId: string;
                }
              | {
                  clientId: string;
                  issuer: string;
                  kind: "mcp";
                  scopes: Array<string>;
                  subject: string;
                  userId: string;
                }
              | { deployId: string; kind: "deploy"; subject: string };
            entryId: string;
            locale: string;
          },
          | { available: false; reason: "policy" | "source" }
          | {
              available: true;
              clientPrefix: string;
              snapshot: {
                document: string;
                epoch: string;
                policyRevision: string;
                protocolVersion?: 1;
                schemaRevision: string;
                version: number;
              };
            },
          Name
        >;
        pullSharedBody: FunctionReference<
          "query",
          "internal",
          {
            _trustedCaller?:
              | { kind: "anonymous"; subject: "system:anonymous" }
              | {
                  email?: string;
                  emailVerified?: boolean;
                  kind: "user";
                  name?: string;
                  subject: string;
                  userId: string;
                }
              | {
                  clientId: string;
                  issuer: string;
                  kind: "mcp";
                  scopes: Array<string>;
                  subject: string;
                  userId: string;
                }
              | { deployId: string; kind: "deploy"; subject: string };
            entryId: string;
            epoch: string;
            locale: string;
            policyRevision: string;
            protocolVersion?: 1;
            schemaRevision: string;
            version: number;
          },
          | {
              status: "ok";
              update: {
                clientIds: Array<string>;
                epoch: string;
                fromVersion: number;
                policyRevision: string;
                protocolVersion?: 1;
                schemaRevision: string;
                steps: Array<string>;
                version: number;
              };
            }
          | {
              head: {
                epoch: string;
                policyRevision: string;
                protocolVersion?: 1;
                schemaRevision: string;
                version: number;
              };
              reason: "epoch" | "schema" | "policy" | "history";
              status: "stale";
            },
          Name
        >;
        pushSharedBody: FunctionReference<
          "mutation",
          "internal",
          {
            _expectedContentHash?: string;
            _expectedPresentationHash?: string;
            _trustedCaller?:
              | { kind: "anonymous"; subject: "system:anonymous" }
              | {
                  email?: string;
                  emailVerified?: boolean;
                  kind: "user";
                  name?: string;
                  subject: string;
                  userId: string;
                }
              | {
                  clientId: string;
                  issuer: string;
                  kind: "mcp";
                  scopes: Array<string>;
                  subject: string;
                  userId: string;
                }
              | { deployId: string; kind: "deploy"; subject: string };
            clientId: string;
            entryId: string;
            epoch: string;
            locale: string;
            policyRevision: string;
            protocolVersion?: 1;
            schemaRevision: string;
            steps: Array<string>;
            version: number;
          },
          | {
              status: "ok";
              update: {
                clientIds: Array<string>;
                epoch: string;
                fromVersion: number;
                policyRevision: string;
                protocolVersion?: 1;
                schemaRevision: string;
                steps: Array<string>;
                version: number;
              };
            }
          | {
              head: {
                epoch: string;
                policyRevision: string;
                protocolVersion?: 1;
                schemaRevision: string;
                version: number;
              };
              reason: "epoch" | "schema" | "policy" | "history";
              status: "stale";
            },
          Name
        >;
      };
      draft: {
        createLocaleVariant: FunctionReference<
          "mutation",
          "internal",
          {
            _expectedContentHash?: string;
            _expectedPresentationHash?: string;
            entryId: string;
            locale: string;
            source: { kind: "blank" } | { kind: "locale"; locale: string };
          },
          string,
          Name
        >;
        mcpSaveEntryDraft: FunctionReference<
          "mutation",
          "internal",
          {
            _expectedContentHash?: string;
            _expectedPresentationHash?: string;
            _trustedCaller?:
              | { kind: "anonymous"; subject: "system:anonymous" }
              | {
                  email?: string;
                  emailVerified?: boolean;
                  kind: "user";
                  name?: string;
                  subject: string;
                  userId: string;
                }
              | {
                  clientId: string;
                  issuer: string;
                  kind: "mcp";
                  scopes: Array<string>;
                  subject: string;
                  userId: string;
                }
              | { deployId: string; kind: "deploy"; subject: string };
            agentRunId: string;
            concurrency?: {
              base: {
                locales?: Record<
                  string,
                  {
                    bodyMdc?: string | null;
                    slug?: string | null;
                    values?: Record<
                      string,
                      _GinkoCmsJsonDepth8
                    >;
                  }
                >;
                shared?: {
                  nodeKind?: "page" | "folder" | "group" | "section";
                  orderRank?: string | null;
                  parentEntryId?: string | null;
                  shared?: Record<
                    string,
                    _GinkoCmsJsonDepth8
                  >;
                  slug?: string | null;
                };
              };
              localeDraftIds: Record<string, string>;
              requestId: string;
            };
            entryId: string;
            expectedDraftVersion: number;
            patch: {
              locales?: Record<
                string,
                {
                  bodyMdc?: string | null;
                  slug?: string | null;
                  values?: Record<
                    string,
                    _GinkoCmsJsonDepth8
                  >;
                }
              >;
              shared?: {
                nodeKind?: "page" | "folder" | "group" | "section";
                orderRank?: string | null;
                parentEntryId?: string | null;
                shared?: Record<
                  string,
                  _GinkoCmsJsonDepth8
                >;
                slug?: string | null;
              };
            };
          },
          { dirtyLocales: Array<string>; draftVersion: number },
          Name
        >;
        previewRevertDraftToPublishedOperation: FunctionReference<
          "mutation",
          "internal",
          {
            _expectedContentHash?: string;
            _expectedPresentationHash?: string;
            entryId: string;
          },
          {
            allowed: boolean;
            blockers: Array<{
              code: string;
              count?: number;
              details?: any;
              message: string;
              status?: "blocked" | "stale";
            }>;
            confirm: any;
            confirmation: { expiresAt: number; token: string } | null;
            details: any;
            effects: Array<{
              count?: number | null;
              countLabel?: string;
              kind: string;
              minimumCount?: number;
              summary: string;
            }>;
            summary: string;
            version: any;
            warnings: Array<{
              code: string;
              count?: number;
              details?: any;
              message: string;
              status?: "blocked" | "stale";
            }>;
          },
          Name
        >;
        revertDraftToPublishedOperationExecute: FunctionReference<
          "mutation",
          "internal",
          {
            _confirmationToken?: string;
            _expectedContentHash?: string;
            _expectedPresentationHash?: string;
            entryId: string;
          },
          | {
              status: "applied";
              value: { dirtyLocales: Array<string>; draftVersion: number };
            }
          | { code: string; details: any; message: string; status: "blocked" }
          | { code: string; details: any; message: string; status: "stale" },
          Name
        >;
        saveEntryDraft: FunctionReference<
          "mutation",
          "internal",
          {
            _expectedContentHash?: string;
            _expectedPresentationHash?: string;
            concurrency?: {
              base: {
                locales?: Record<
                  string,
                  {
                    bodyMdc?: string | null;
                    slug?: string | null;
                    values?: Record<
                      string,
                      _GinkoCmsJsonDepth8
                    >;
                  }
                >;
                shared?: {
                  nodeKind?: "page" | "folder" | "group" | "section";
                  orderRank?: string | null;
                  parentEntryId?: string | null;
                  shared?: Record<
                    string,
                    _GinkoCmsJsonDepth8
                  >;
                  slug?: string | null;
                };
              };
              localeDraftIds: Record<string, string>;
              requestId: string;
            };
            entryId: string;
            expectedDraftVersion: number;
            patch: {
              locales?: Record<
                string,
                {
                  bodyMdc?: string | null;
                  slug?: string | null;
                  values?: Record<
                    string,
                    _GinkoCmsJsonDepth8
                  >;
                }
              >;
              shared?: {
                nodeKind?: "page" | "folder" | "group" | "section";
                orderRank?: string | null;
                parentEntryId?: string | null;
                shared?: Record<
                  string,
                  _GinkoCmsJsonDepth8
                >;
                slug?: string | null;
              };
            };
          },
          { dirtyLocales: Array<string>; draftVersion: number },
          Name
        >;
      };
      history: {
        getDraftVsPublishedDiff: FunctionReference<
          "query",
          "internal",
          { entryId: string },
          {
            changes: Array<{
              field: string;
              left:
                | null
                | boolean
                | number
                | string
                | Array<
                    _GinkoCmsJsonDepth7
                  >
                | Record<
                    string,
                    _GinkoCmsJsonDepth7
                  >
                | null;
              right:
                | null
                | boolean
                | number
                | string
                | Array<
                    _GinkoCmsJsonDepth7
                  >
                | Record<
                    string,
                    _GinkoCmsJsonDepth7
                  >
                | null;
            }>;
          },
          Name
        >;
        getVersionDiff: FunctionReference<
          "query",
          "internal",
          { leftVersionId: string; rightVersionId: string },
          {
            changes: Array<{
              field: string;
              left:
                | null
                | boolean
                | number
                | string
                | Array<
                    _GinkoCmsJsonDepth7
                  >
                | Record<
                    string,
                    _GinkoCmsJsonDepth7
                  >
                | null;
              right:
                | null
                | boolean
                | number
                | string
                | Array<
                    _GinkoCmsJsonDepth7
                  >
                | Record<
                    string,
                    _GinkoCmsJsonDepth7
                  >
                | null;
            }>;
            leftVersionId: string;
            rightVersionId: string;
          },
          Name
        >;
        getVersionSnapshot: FunctionReference<
          "query",
          "internal",
          { locale?: string; versionId: string },
          {
            _id: string;
            action: string;
            createdAt: number;
            message: string | null;
            snapshot: {
              baseSlug: string;
              locale: {
                path: string;
                slug: string | null;
                values: Record<
                  string,
                  _GinkoCmsJsonDepth8
                > | null;
              } | null;
              shared: Record<
                string,
                _GinkoCmsJsonDepth8
              >;
            };
            version: number;
          },
          Name
        >;
        listVersions: FunctionReference<
          "query",
          "internal",
          {
            entryId: string;
            paginationOpts: {
              cursor: string | null;
              endCursor?: string | null;
              id?: number;
              maximumBytesRead?: number;
              maximumRowsRead?: number;
              numItems: number;
            };
          },
          {
            continueCursor: string;
            isDone: boolean;
            page: Array<{
              _id: string;
              action: string;
              createdAt: number;
              createdBy: string;
              displayAction:
                | "published"
                | "restoredPublished"
                | "restoredDraft"
                | "unpublished"
                | "archived"
                | "checkpoint"
                | "routeUpdated";
              isCurrentPublished: boolean;
              message: string | null;
              publishedLocales: Array<string>;
              version: number;
            }>;
          },
          Name
        >;
      };
      permanentDelete: {
        permanentlyDeleteEntryOperationExecute: FunctionReference<
          "mutation",
          "internal",
          {
            _confirmationToken?: string;
            _expectedContentHash?: string;
            _expectedPresentationHash?: string;
            confirmationPhrase: string;
            entryId: string;
          },
          | {
              status: "applied";
              value: {
                activityRecordsRetainedAtDeletion: number;
                alreadyDeleted: boolean;
                collection: string;
                deleted: boolean;
                entryId: string;
                legalActivityRecordsRetained: number;
                stableId: string;
                standardActivityRecordsRetainedAtDeletion: number;
              };
            }
          | { code: string; details: any; message: string; status: "blocked" }
          | { code: string; details: any; message: string; status: "stale" },
          Name
        >;
        previewPermanentlyDeleteEntryOperation: FunctionReference<
          "mutation",
          "internal",
          {
            _expectedContentHash?: string;
            _expectedPresentationHash?: string;
            confirmationPhrase: string;
            entryId: string;
          },
          {
            allowed: boolean;
            blockers: Array<{
              code: string;
              count?: number;
              details?: any;
              message: string;
              status?: "blocked" | "stale";
            }>;
            confirm: any;
            confirmation: { expiresAt: number; token: string } | null;
            details: any;
            effects: Array<{
              count?: number | null;
              countLabel?: string;
              kind: string;
              minimumCount?: number;
              summary: string;
            }>;
            summary: string;
            version: any;
            warnings: Array<{
              code: string;
              count?: number;
              details?: any;
              message: string;
              status?: "blocked" | "stale";
            }>;
          },
          Name
        >;
      };
      projectionMaintenance: {
        getProjectionRepairRun: FunctionReference<
          "query",
          "internal",
          { runId: string },
          {
            autoContinue: boolean;
            canonicalGeneration: number;
            completedAt: number | null;
            createdAt: number;
            createdBy: string;
            cursor: string | null;
            deletedOrphans: number;
            generation: number;
            inspectedAssetRefs: number;
            inspectedDraftSearchRows: number;
            inspectedPublicRows: number;
            issueCount: number;
            lastIssue: string | null;
            pageSize: number;
            phase:
              | "entries"
              | "drafts"
              | "revisions"
              | "draftSearchRows"
              | "publicRows"
              | "publicSearchRows"
              | "assetRefs"
              | "verifyEntries"
              | "verifyDrafts"
              | "verifyRevisions"
              | "verifyDraftSearchRows"
              | "verifyPublicRows"
              | "verifyPublicSearchRows"
              | "verifyAssetRefs";
            processedDrafts: number;
            processedEntries: number;
            processedRevisions: number;
            referencedAssetIds: Array<string>;
            repairedAssetRefSources: number;
            repairedDraftSearchRows: number;
            repairedPublicRows: number;
            runId: string;
            state: "running" | "complete" | "failed" | "dead";
            updatedAt: number;
            workAttempts: number;
            workDeadLetteredAt: number | null;
            workGeneration: number;
            workLastError: string | null;
            workLeaseExpiresAt: number | null;
            workNextAttemptAt: number | null;
            workToken: string | null;
          } | null,
          Name
        >;
        resumeProjectionRepairRun: FunctionReference<
          "mutation",
          "internal",
          {
            _expectedContentHash?: string;
            _expectedPresentationHash?: string;
            autoContinue?: boolean;
            runId: string;
          },
          {
            autoContinue: boolean;
            canonicalGeneration: number;
            completedAt: number | null;
            createdAt: number;
            createdBy: string;
            cursor: string | null;
            deletedOrphans: number;
            generation: number;
            inspectedAssetRefs: number;
            inspectedDraftSearchRows: number;
            inspectedPublicRows: number;
            issueCount: number;
            lastIssue: string | null;
            pageSize: number;
            phase:
              | "entries"
              | "drafts"
              | "revisions"
              | "draftSearchRows"
              | "publicRows"
              | "publicSearchRows"
              | "assetRefs"
              | "verifyEntries"
              | "verifyDrafts"
              | "verifyRevisions"
              | "verifyDraftSearchRows"
              | "verifyPublicRows"
              | "verifyPublicSearchRows"
              | "verifyAssetRefs";
            processedDrafts: number;
            processedEntries: number;
            processedRevisions: number;
            referencedAssetIds: Array<string>;
            repairedAssetRefSources: number;
            repairedDraftSearchRows: number;
            repairedPublicRows: number;
            runId: string;
            state: "running" | "complete" | "failed" | "dead";
            updatedAt: number;
            workAttempts: number;
            workDeadLetteredAt: number | null;
            workGeneration: number;
            workLastError: string | null;
            workLeaseExpiresAt: number | null;
            workNextAttemptAt: number | null;
            workToken: string | null;
          },
          Name
        >;
        startProjectionRepairRun: FunctionReference<
          "mutation",
          "internal",
          {
            _expectedContentHash?: string;
            _expectedPresentationHash?: string;
            autoContinue?: boolean;
            pageSize?: number;
            runId: string;
          },
          {
            autoContinue: boolean;
            canonicalGeneration: number;
            completedAt: number | null;
            createdAt: number;
            createdBy: string;
            cursor: string | null;
            deletedOrphans: number;
            generation: number;
            inspectedAssetRefs: number;
            inspectedDraftSearchRows: number;
            inspectedPublicRows: number;
            issueCount: number;
            lastIssue: string | null;
            pageSize: number;
            phase:
              | "entries"
              | "drafts"
              | "revisions"
              | "draftSearchRows"
              | "publicRows"
              | "publicSearchRows"
              | "assetRefs"
              | "verifyEntries"
              | "verifyDrafts"
              | "verifyRevisions"
              | "verifyDraftSearchRows"
              | "verifyPublicRows"
              | "verifyPublicSearchRows"
              | "verifyAssetRefs";
            processedDrafts: number;
            processedEntries: number;
            processedRevisions: number;
            referencedAssetIds: Array<string>;
            repairedAssetRefSources: number;
            repairedDraftSearchRows: number;
            repairedPublicRows: number;
            runId: string;
            state: "running" | "complete" | "failed" | "dead";
            updatedAt: number;
            workAttempts: number;
            workDeadLetteredAt: number | null;
            workGeneration: number;
            workLastError: string | null;
            workLeaseExpiresAt: number | null;
            workNextAttemptAt: number | null;
            workToken: string | null;
          },
          Name
        >;
      };
      publicationHistory: {
        previewRollbackVersionOperation: FunctionReference<
          "mutation",
          "internal",
          {
            _expectedContentHash?: string;
            _expectedPresentationHash?: string;
            entryId: string;
            publish?: boolean;
            versionId: string;
          },
          {
            allowed: boolean;
            blockers: Array<{
              code: string;
              count?: number;
              details?: any;
              message: string;
              status?: "blocked" | "stale";
            }>;
            confirm: any;
            confirmation: { expiresAt: number; token: string } | null;
            details: any;
            effects: Array<{
              count?: number | null;
              countLabel?: string;
              kind: string;
              minimumCount?: number;
              summary: string;
            }>;
            summary: string;
            version: any;
            warnings: Array<{
              code: string;
              count?: number;
              details?: any;
              message: string;
              status?: "blocked" | "stale";
            }>;
          },
          Name
        >;
        rollbackVersionOperationExecute: FunctionReference<
          "mutation",
          "internal",
          {
            _confirmationToken?: string;
            _expectedContentHash?: string;
            _expectedPresentationHash?: string;
            entryId: string;
            publish?: boolean;
            versionId: string;
          },
          | { status: "applied"; value: { versionId: string } }
          | { code: string; details: any; message: string; status: "blocked" }
          | { code: string; details: any; message: string; status: "stale" },
          Name
        >;
      };
      publish: {
        archiveEntryOperationExecute: FunctionReference<
          "mutation",
          "internal",
          {
            _confirmationToken?: string;
            _expectedContentHash?: string;
            _expectedPresentationHash?: string;
            entryId: string;
          },
          | { status: "applied"; value: null }
          | { code: string; details: any; message: string; status: "blocked" }
          | { code: string; details: any; message: string; status: "stale" },
          Name
        >;
        createCheckpoint: FunctionReference<
          "mutation",
          "internal",
          {
            _expectedContentHash?: string;
            _expectedPresentationHash?: string;
            entryId: string;
            message: string;
          },
          string,
          Name
        >;
        listPublishRouteImpactPage: FunctionReference<
          "query",
          "internal",
          {
            cursor?: string | null;
            entryId: string;
            expectedRouteGeneration: number;
            expectedVersion: number;
            limit?: number;
            locale: string;
          },
          {
            changes: Array<{
              after: string | boolean | null;
              before: string | boolean | null;
              entryId?: string;
              kind: "route" | "redirect" | "sitemap" | "search" | "nav" | "seo";
              label: string;
              locale: string;
              scope?: "current_entry" | "descendant";
            }>;
            collection: string;
            continueCursor: string | null;
            draftVersion: number;
            entryId: string;
            isDone: boolean;
            locale: string;
            routeGeneration: number;
          },
          Name
        >;
        mcpPreviewPublishEntry: FunctionReference<
          "mutation",
          "internal",
          {
            _expectedContentHash?: string;
            _expectedPresentationHash?: string;
            _trustedCaller?:
              | { kind: "anonymous"; subject: "system:anonymous" }
              | {
                  email?: string;
                  emailVerified?: boolean;
                  kind: "user";
                  name?: string;
                  subject: string;
                  userId: string;
                }
              | {
                  clientId: string;
                  issuer: string;
                  kind: "mcp";
                  scopes: Array<string>;
                  subject: string;
                  userId: string;
                }
              | { deployId: string; kind: "deploy"; subject: string };
            agentRunId: string;
            entryId: string;
            expectedVersion: number;
            locales: Array<string>;
            message?: string;
          },
          {
            allowed: boolean;
            blockers: Array<{
              code: string;
              count?: number;
              details?: any;
              message: string;
              status?: "blocked" | "stale";
            }>;
            confirm: any;
            confirmation: { expiresAt: number; token: string } | null;
            details: any;
            effects: Array<{
              count?: number | null;
              countLabel?: string;
              kind: string;
              minimumCount?: number;
              summary: string;
            }>;
            summary: string;
            version: any;
            warnings: Array<{
              code: string;
              count?: number;
              details?: any;
              message: string;
              status?: "blocked" | "stale";
            }>;
          },
          Name
        >;
        previewArchiveEntryOperation: FunctionReference<
          "mutation",
          "internal",
          {
            _expectedContentHash?: string;
            _expectedPresentationHash?: string;
            entryId: string;
          },
          {
            allowed: boolean;
            blockers: Array<{
              code: string;
              count?: number;
              details?: any;
              message: string;
              status?: "blocked" | "stale";
            }>;
            confirm: any;
            confirmation: { expiresAt: number; token: string } | null;
            details: any;
            effects: Array<{
              count?: number | null;
              countLabel?: string;
              kind: string;
              minimumCount?: number;
              summary: string;
            }>;
            summary: string;
            version: any;
            warnings: Array<{
              code: string;
              count?: number;
              details?: any;
              message: string;
              status?: "blocked" | "stale";
            }>;
          },
          Name
        >;
        previewPublishEntryOperation: FunctionReference<
          "mutation",
          "internal",
          {
            _expectedContentHash?: string;
            _expectedPresentationHash?: string;
            entryId: string;
            expectedVersion: number;
            locales: Array<string>;
            message?: string;
          },
          {
            allowed: boolean;
            blockers: Array<{
              code: string;
              count?: number;
              details?: any;
              message: string;
              status?: "blocked" | "stale";
            }>;
            confirm: any;
            confirmation: { expiresAt: number; token: string } | null;
            details: any;
            effects: Array<{
              count?: number | null;
              countLabel?: string;
              kind: string;
              minimumCount?: number;
              summary: string;
            }>;
            summary: string;
            version: any;
            warnings: Array<{
              code: string;
              count?: number;
              details?: any;
              message: string;
              status?: "blocked" | "stale";
            }>;
          },
          Name
        >;
        previewRestoreEntryOperation: FunctionReference<
          "mutation",
          "internal",
          {
            _expectedContentHash?: string;
            _expectedPresentationHash?: string;
            entryId: string;
          },
          {
            allowed: boolean;
            blockers: Array<{
              code: string;
              count?: number;
              details?: any;
              message: string;
              status?: "blocked" | "stale";
            }>;
            confirm: any;
            confirmation: { expiresAt: number; token: string } | null;
            details: any;
            effects: Array<{
              count?: number | null;
              countLabel?: string;
              kind: string;
              minimumCount?: number;
              summary: string;
            }>;
            summary: string;
            version: any;
            warnings: Array<{
              code: string;
              count?: number;
              details?: any;
              message: string;
              status?: "blocked" | "stale";
            }>;
          },
          Name
        >;
        previewUnpublishEntryOperation: FunctionReference<
          "mutation",
          "internal",
          {
            _expectedContentHash?: string;
            _expectedPresentationHash?: string;
            entryId: string;
            locales: Array<string>;
          },
          {
            allowed: boolean;
            blockers: Array<{
              code: string;
              count?: number;
              details?: any;
              message: string;
              status?: "blocked" | "stale";
            }>;
            confirm: any;
            confirmation: { expiresAt: number; token: string } | null;
            details: any;
            effects: Array<{
              count?: number | null;
              countLabel?: string;
              kind: string;
              minimumCount?: number;
              summary: string;
            }>;
            summary: string;
            version: any;
            warnings: Array<{
              code: string;
              count?: number;
              details?: any;
              message: string;
              status?: "blocked" | "stale";
            }>;
          },
          Name
        >;
        publishEntryOperationExecute: FunctionReference<
          "mutation",
          "internal",
          {
            _confirmationToken?: string;
            _expectedContentHash?: string;
            _expectedPresentationHash?: string;
            entryId: string;
            expectedVersion: number;
            locales: Array<string>;
            message?: string;
          },
          | {
              status: "applied";
              value: {
                dirtyLocales: Array<string>;
                draftVersion: number;
                versionId: string;
              };
            }
          | { code: string; details: any; message: string; status: "blocked" }
          | { code: string; details: any; message: string; status: "stale" },
          Name
        >;
        restoreEntryOperationExecute: FunctionReference<
          "mutation",
          "internal",
          {
            _confirmationToken?: string;
            _expectedContentHash?: string;
            _expectedPresentationHash?: string;
            entryId: string;
          },
          | { status: "applied"; value: null }
          | { code: string; details: any; message: string; status: "blocked" }
          | { code: string; details: any; message: string; status: "stale" },
          Name
        >;
        unpublishEntryOperationExecute: FunctionReference<
          "mutation",
          "internal",
          {
            _confirmationToken?: string;
            _expectedContentHash?: string;
            _expectedPresentationHash?: string;
            entryId: string;
            locales: Array<string>;
          },
          | { status: "applied"; value: null }
          | { code: string; details: any; message: string; status: "blocked" }
          | { code: string; details: any; message: string; status: "stale" },
          Name
        >;
      };
      read: {
        getEntry: FunctionReference<
          "query",
          "internal",
          {
            _trustedCaller?:
              | { kind: "anonymous"; subject: "system:anonymous" }
              | {
                  email?: string;
                  emailVerified?: boolean;
                  kind: "user";
                  name?: string;
                  subject: string;
                  userId: string;
                }
              | {
                  clientId: string;
                  issuer: string;
                  kind: "mcp";
                  scopes: Array<string>;
                  subject: string;
                  userId: string;
                }
              | { deployId: string; kind: "deploy"; subject: string };
            id: string;
            locale?: string;
          },
          null | {
            _can?: Record<string, boolean>;
            _id: string;
            baseSlug: string;
            collection: string;
            createdAt: number;
            createdBy: string;
            data:
              _GinkoCmsJsonDepth8;
            dirtyLocales: Array<string>;
            draft:
              _GinkoCmsJsonDepth8;
            draftVersion: number;
            locale: string;
            localeData: {
              draft: {
                bodyMdc?: string | null;
                values: Record<
                  string,
                  _GinkoCmsJsonDepth8
                >;
              };
              draftId: string | null;
              draftPath: string;
              draftSlug: string | null;
              published: {
                bodyMdc?: string | null;
                values: Record<
                  string,
                  _GinkoCmsJsonDepth8
                >;
              } | null;
              publishedPath: string | null;
              publishedSlug: string | null;
            } | null;
            localeVariants: Array<{
              complete: boolean;
              draftExists: boolean;
              draftPath: string;
              entryId: string;
              filledRequired: number;
              isCurrent: boolean;
              label: string;
              locale: string;
              publishedPath: string | null;
              totalRequired: number;
              updatedAt: number;
            }>;
            locales: Array<{
              completion: {
                complete: boolean;
                errors: Array<{ field: string; message: string }>;
                filledRequired: number;
                totalRequired: number;
              };
              data: Record<
                string,
                _GinkoCmsJsonDepth8
              >;
              draft: {
                bodyMdc?: string | null;
                values: Record<
                  string,
                  _GinkoCmsJsonDepth8
                >;
              };
              draftExists: boolean;
              draftId: string | null;
              draftPath: string;
              draftSlug: string | null;
              entryId: string;
              locale: string;
              published: {
                bodyMdc?: string | null;
                values: Record<
                  string,
                  _GinkoCmsJsonDepth8
                >;
              } | null;
              publishedData: Record<
                string,
                _GinkoCmsJsonDepth8
              >;
              publishedPath: string | null;
              publishedSlug: string | null;
              updatedAt: number;
              updatedBy: string;
            }>;
            nodeKind: "page" | "folder" | "group" | "section";
            orderRank: string;
            parentEntryId: string | null;
            path: string | null;
            published:
              | null
              | boolean
              | number
              | string
              | Array<
                  _GinkoCmsJsonDepth7
                >
              | Record<
                  string,
                  _GinkoCmsJsonDepth7
                >
              | null;
            publishedAt: number | null;
            publishedBy: string | null;
            publishedData:
              | null
              | boolean
              | number
              | string
              | Array<
                  _GinkoCmsJsonDepth7
                >
              | Record<
                  string,
                  _GinkoCmsJsonDepth7
                >
              | null;
            schema: {
              fields: Array<{
                condition?: Record<
                  string,
                  _GinkoCmsJsonDepth8
                > | null;
                defaultValue?:
                  _GinkoCmsJsonDepth8;
                description?: string | null;
                fields?: Array<{
                  condition?: Record<
                    string,
                    _GinkoCmsJsonDepth8
                  > | null;
                  defaultValue?:
                    _GinkoCmsJsonDepth8;
                  description?: string | null;
                  fields?: Array<{
                    condition?: Record<
                      string,
                      _GinkoCmsJsonDepth8
                    > | null;
                    defaultValue?:
                      _GinkoCmsJsonDepth8;
                    description?: string | null;
                    fields?: Array<{
                      condition?: Record<
                        string,
                        _GinkoCmsJsonDepth8
                      > | null;
                      defaultValue?:
                        _GinkoCmsJsonDepth8;
                      description?: string | null;
                      fields?: Array<{
                        condition?: Record<
                          string,
                          _GinkoCmsJsonDepth8
                        > | null;
                        defaultValue?:
                          _GinkoCmsJsonDepth8;
                        description?: string | null;
                        fields?: Array<{
                          condition?: Record<
                            string,
                            _GinkoCmsJsonDepth8
                          > | null;
                          defaultValue?:
                            _GinkoCmsJsonDepth8;
                          description?: string | null;
                          fields?: Array<{
                            condition?: Record<
                              string,
                              _GinkoCmsJsonDepth8
                            > | null;
                            defaultValue?:
                              _GinkoCmsJsonDepth8;
                            description?: string | null;
                            fields?: Array<{
                              condition?: Record<
                                string,
                                _GinkoCmsJsonDepth8
                              > | null;
                              defaultValue?:
                                _GinkoCmsJsonDepth8;
                              description?: string | null;
                              fields?: Array<{
                                condition?: Record<
                                  string,
                                  _GinkoCmsJsonDepth8
                                > | null;
                                defaultValue?:
                                  _GinkoCmsJsonDepth8;
                                description?: string | null;
                                fields?: null;
                                hidden?: boolean;
                                key: string;
                                label?: string | Record<string, string> | null;
                                language?: string | null;
                                localized?: boolean;
                                max?: number | null;
                                media?: {
                                  accept?: Array<string>;
                                  aspectRatio?: string | null;
                                } | null;
                                min?: number | null;
                                options?: Array<string> | null;
                                order?: number;
                                relation?: {
                                  collection: string;
                                  multiple?: boolean;
                                } | null;
                                required?: boolean;
                                searchable?: boolean;
                                slugFrom?: string | null;
                                sortable?: boolean;
                                step?: number | null;
                                type:
                                  | "text"
                                  | "textarea"
                                  | "richtext"
                                  | "slug"
                                  | "email"
                                  | "url"
                                  | "number"
                                  | "range"
                                  | "select"
                                  | "multiselect"
                                  | "radio"
                                  | "checkbox"
                                  | "toggle"
                                  | "date"
                                  | "datetime"
                                  | "time"
                                  | "json"
                                  | "object"
                                  | "array"
                                  | "blocks"
                                  | "relation"
                                  | "relations"
                                  | "image"
                                  | "images"
                                  | "file"
                                  | "icon"
                                  | "code"
                                  | "color"
                                  | "divider"
                                  | "section";
                                validation?: Record<
                                  string,
                                  _GinkoCmsJsonDepth8
                                > | null;
                                width?: "full" | "half";
                              }> | null;
                              hidden?: boolean;
                              key: string;
                              label?: string | Record<string, string> | null;
                              language?: string | null;
                              localized?: boolean;
                              max?: number | null;
                              media?: {
                                accept?: Array<string>;
                                aspectRatio?: string | null;
                              } | null;
                              min?: number | null;
                              options?: Array<string> | null;
                              order?: number;
                              relation?: {
                                collection: string;
                                multiple?: boolean;
                              } | null;
                              required?: boolean;
                              searchable?: boolean;
                              slugFrom?: string | null;
                              sortable?: boolean;
                              step?: number | null;
                              type:
                                | "text"
                                | "textarea"
                                | "richtext"
                                | "slug"
                                | "email"
                                | "url"
                                | "number"
                                | "range"
                                | "select"
                                | "multiselect"
                                | "radio"
                                | "checkbox"
                                | "toggle"
                                | "date"
                                | "datetime"
                                | "time"
                                | "json"
                                | "object"
                                | "array"
                                | "blocks"
                                | "relation"
                                | "relations"
                                | "image"
                                | "images"
                                | "file"
                                | "icon"
                                | "code"
                                | "color"
                                | "divider"
                                | "section";
                              validation?: Record<
                                string,
                                _GinkoCmsJsonDepth8
                              > | null;
                              width?: "full" | "half";
                            }> | null;
                            hidden?: boolean;
                            key: string;
                            label?: string | Record<string, string> | null;
                            language?: string | null;
                            localized?: boolean;
                            max?: number | null;
                            media?: {
                              accept?: Array<string>;
                              aspectRatio?: string | null;
                            } | null;
                            min?: number | null;
                            options?: Array<string> | null;
                            order?: number;
                            relation?: {
                              collection: string;
                              multiple?: boolean;
                            } | null;
                            required?: boolean;
                            searchable?: boolean;
                            slugFrom?: string | null;
                            sortable?: boolean;
                            step?: number | null;
                            type:
                              | "text"
                              | "textarea"
                              | "richtext"
                              | "slug"
                              | "email"
                              | "url"
                              | "number"
                              | "range"
                              | "select"
                              | "multiselect"
                              | "radio"
                              | "checkbox"
                              | "toggle"
                              | "date"
                              | "datetime"
                              | "time"
                              | "json"
                              | "object"
                              | "array"
                              | "blocks"
                              | "relation"
                              | "relations"
                              | "image"
                              | "images"
                              | "file"
                              | "icon"
                              | "code"
                              | "color"
                              | "divider"
                              | "section";
                            validation?: Record<
                              string,
                              _GinkoCmsJsonDepth8
                            > | null;
                            width?: "full" | "half";
                          }> | null;
                          hidden?: boolean;
                          key: string;
                          label?: string | Record<string, string> | null;
                          language?: string | null;
                          localized?: boolean;
                          max?: number | null;
                          media?: {
                            accept?: Array<string>;
                            aspectRatio?: string | null;
                          } | null;
                          min?: number | null;
                          options?: Array<string> | null;
                          order?: number;
                          relation?: {
                            collection: string;
                            multiple?: boolean;
                          } | null;
                          required?: boolean;
                          searchable?: boolean;
                          slugFrom?: string | null;
                          sortable?: boolean;
                          step?: number | null;
                          type:
                            | "text"
                            | "textarea"
                            | "richtext"
                            | "slug"
                            | "email"
                            | "url"
                            | "number"
                            | "range"
                            | "select"
                            | "multiselect"
                            | "radio"
                            | "checkbox"
                            | "toggle"
                            | "date"
                            | "datetime"
                            | "time"
                            | "json"
                            | "object"
                            | "array"
                            | "blocks"
                            | "relation"
                            | "relations"
                            | "image"
                            | "images"
                            | "file"
                            | "icon"
                            | "code"
                            | "color"
                            | "divider"
                            | "section";
                          validation?: Record<
                            string,
                            _GinkoCmsJsonDepth8
                          > | null;
                          width?: "full" | "half";
                        }> | null;
                        hidden?: boolean;
                        key: string;
                        label?: string | Record<string, string> | null;
                        language?: string | null;
                        localized?: boolean;
                        max?: number | null;
                        media?: {
                          accept?: Array<string>;
                          aspectRatio?: string | null;
                        } | null;
                        min?: number | null;
                        options?: Array<string> | null;
                        order?: number;
                        relation?: {
                          collection: string;
                          multiple?: boolean;
                        } | null;
                        required?: boolean;
                        searchable?: boolean;
                        slugFrom?: string | null;
                        sortable?: boolean;
                        step?: number | null;
                        type:
                          | "text"
                          | "textarea"
                          | "richtext"
                          | "slug"
                          | "email"
                          | "url"
                          | "number"
                          | "range"
                          | "select"
                          | "multiselect"
                          | "radio"
                          | "checkbox"
                          | "toggle"
                          | "date"
                          | "datetime"
                          | "time"
                          | "json"
                          | "object"
                          | "array"
                          | "blocks"
                          | "relation"
                          | "relations"
                          | "image"
                          | "images"
                          | "file"
                          | "icon"
                          | "code"
                          | "color"
                          | "divider"
                          | "section";
                        validation?: Record<
                          string,
                          _GinkoCmsJsonDepth8
                        > | null;
                        width?: "full" | "half";
                      }> | null;
                      hidden?: boolean;
                      key: string;
                      label?: string | Record<string, string> | null;
                      language?: string | null;
                      localized?: boolean;
                      max?: number | null;
                      media?: {
                        accept?: Array<string>;
                        aspectRatio?: string | null;
                      } | null;
                      min?: number | null;
                      options?: Array<string> | null;
                      order?: number;
                      relation?: {
                        collection: string;
                        multiple?: boolean;
                      } | null;
                      required?: boolean;
                      searchable?: boolean;
                      slugFrom?: string | null;
                      sortable?: boolean;
                      step?: number | null;
                      type:
                        | "text"
                        | "textarea"
                        | "richtext"
                        | "slug"
                        | "email"
                        | "url"
                        | "number"
                        | "range"
                        | "select"
                        | "multiselect"
                        | "radio"
                        | "checkbox"
                        | "toggle"
                        | "date"
                        | "datetime"
                        | "time"
                        | "json"
                        | "object"
                        | "array"
                        | "blocks"
                        | "relation"
                        | "relations"
                        | "image"
                        | "images"
                        | "file"
                        | "icon"
                        | "code"
                        | "color"
                        | "divider"
                        | "section";
                      validation?: Record<
                        string,
                        _GinkoCmsJsonDepth8
                      > | null;
                      width?: "full" | "half";
                    }> | null;
                    hidden?: boolean;
                    key: string;
                    label?: string | Record<string, string> | null;
                    language?: string | null;
                    localized?: boolean;
                    max?: number | null;
                    media?: {
                      accept?: Array<string>;
                      aspectRatio?: string | null;
                    } | null;
                    min?: number | null;
                    options?: Array<string> | null;
                    order?: number;
                    relation?: {
                      collection: string;
                      multiple?: boolean;
                    } | null;
                    required?: boolean;
                    searchable?: boolean;
                    slugFrom?: string | null;
                    sortable?: boolean;
                    step?: number | null;
                    type:
                      | "text"
                      | "textarea"
                      | "richtext"
                      | "slug"
                      | "email"
                      | "url"
                      | "number"
                      | "range"
                      | "select"
                      | "multiselect"
                      | "radio"
                      | "checkbox"
                      | "toggle"
                      | "date"
                      | "datetime"
                      | "time"
                      | "json"
                      | "object"
                      | "array"
                      | "blocks"
                      | "relation"
                      | "relations"
                      | "image"
                      | "images"
                      | "file"
                      | "icon"
                      | "code"
                      | "color"
                      | "divider"
                      | "section";
                    validation?: Record<
                      string,
                      _GinkoCmsJsonDepth8
                    > | null;
                    width?: "full" | "half";
                  }> | null;
                  hidden?: boolean;
                  key: string;
                  label?: string | Record<string, string> | null;
                  language?: string | null;
                  localized?: boolean;
                  max?: number | null;
                  media?: {
                    accept?: Array<string>;
                    aspectRatio?: string | null;
                  } | null;
                  min?: number | null;
                  options?: Array<string> | null;
                  order?: number;
                  relation?: { collection: string; multiple?: boolean } | null;
                  required?: boolean;
                  searchable?: boolean;
                  slugFrom?: string | null;
                  sortable?: boolean;
                  step?: number | null;
                  type:
                    | "text"
                    | "textarea"
                    | "richtext"
                    | "slug"
                    | "email"
                    | "url"
                    | "number"
                    | "range"
                    | "select"
                    | "multiselect"
                    | "radio"
                    | "checkbox"
                    | "toggle"
                    | "date"
                    | "datetime"
                    | "time"
                    | "json"
                    | "object"
                    | "array"
                    | "blocks"
                    | "relation"
                    | "relations"
                    | "image"
                    | "images"
                    | "file"
                    | "icon"
                    | "code"
                    | "color"
                    | "divider"
                    | "section";
                  validation?: Record<
                    string,
                    _GinkoCmsJsonDepth8
                  > | null;
                  width?: "full" | "half";
                }> | null;
                hidden?: boolean;
                key: string;
                label?: string | Record<string, string> | null;
                language?: string | null;
                localized?: boolean;
                max?: number | null;
                media?: {
                  accept?: Array<string>;
                  aspectRatio?: string | null;
                } | null;
                min?: number | null;
                options?: Array<string> | null;
                order?: number;
                relation?: { collection: string; multiple?: boolean } | null;
                required?: boolean;
                searchable?: boolean;
                slugFrom?: string | null;
                sortable?: boolean;
                step?: number | null;
                type:
                  | "text"
                  | "textarea"
                  | "richtext"
                  | "slug"
                  | "email"
                  | "url"
                  | "number"
                  | "range"
                  | "select"
                  | "multiselect"
                  | "radio"
                  | "checkbox"
                  | "toggle"
                  | "date"
                  | "datetime"
                  | "time"
                  | "json"
                  | "object"
                  | "array"
                  | "blocks"
                  | "relation"
                  | "relations"
                  | "image"
                  | "images"
                  | "file"
                  | "icon"
                  | "code"
                  | "color"
                  | "divider"
                  | "section";
                validation?: Record<
                  string,
                  _GinkoCmsJsonDepth8
                > | null;
                width?: "full" | "half";
              }>;
              locales: Array<string>;
              routing: {
                mode?: "route" | "none";
                pathPrefix: string;
                rootSlug?: string | null;
                singleton?: boolean;
                slugMode?:
                  "shared" | "localized" | "stable" | "localizedStable";
              };
              settings:
                _GinkoCmsJsonDepth8;
              slug: string;
              type: "flat" | "tree";
            };
            slug: string;
            stableId: string | null;
            status: "draft" | "published" | "archived";
            updatedAt: number;
            updatedBy: string;
          },
          Name
        >;
        getEntryReadinessDetail: FunctionReference<
          "query",
          "internal",
          {
            _trustedCaller?:
              | { kind: "anonymous"; subject: "system:anonymous" }
              | {
                  email?: string;
                  emailVerified?: boolean;
                  kind: "user";
                  name?: string;
                  subject: string;
                  userId: string;
                }
              | {
                  clientId: string;
                  issuer: string;
                  kind: "mcp";
                  scopes: Array<string>;
                  subject: string;
                  userId: string;
                }
              | { deployId: string; kind: "deploy"; subject: string };
            entryId: string;
          },
          {
            collection: string;
            entryId: string;
            locales: Array<{
              affectedPublicUrls: Array<{
                afterHref: string | null;
                afterPath: string | null;
                beforeHref: string | null;
                beforePath: string | null;
                entryId: string;
                kind: "current_entry" | "descendant";
                locale: string;
                reason:
                  | "publish"
                  | "route_changed"
                  | "parent_route_changed"
                  | "unpublish"
                  | "archive";
              }>;
              blockers: Array<{
                code:
                  | "required_field_missing"
                  | "required_localized_field_missing"
                  | "required_shared_field_missing"
                  | "body_required"
                  | "seo_title_required"
                  | "seo_description_required"
                  | "asset_alt_required"
                  | "asset_caption_required"
                  | "collection_schema_invalid"
                  | "data_only_required_field_missing"
                  | "locale_missing"
                  | "locale_not_configured"
                  | "primary_locale_missing"
                  | "default_locale_unknown"
                  | "fallback_not_configured"
                  | "locale_parent_missing"
                  | "locale_public_projection_missing"
                  | "locale_public_route_missing"
                  | "locale_slug_missing"
                  | "locale_switch_target_missing"
                  | "route_missing"
                  | "route_collision"
                  | "route_reserved"
                  | "route_invalid"
                  | "route_parent_not_public"
                  | "route_descendant_collision"
                  | "route_descendant_rebuild_failed"
                  | "route_cycle_detected"
                  | "route_depth_exceeded"
                  | "route_slug_unchanged_noop"
                  | "review_request_stale"
                  | "review_preview_stale"
                  | "review_preview_missing"
                  | "review_not_authorized"
                  | "review_already_closed"
                  | "review_publish_blocked"
                  | "review_locale_mismatch"
                  | "review_version_hash_mismatch"
                  | "permission_publish_missing"
                  | "permission_review_missing"
                  | "permission_archive_missing"
                  | "permission_restore_missing"
                  | "permission_agent_scope_missing"
                  | "permission_member_inactive"
                  | "permission_api_key_revoked"
                  | "permission_role_not_allowed"
                  | "agent_run_missing"
                  | "agent_run_not_owned"
                  | "agent_run_closed"
                  | "agent_publish_requires_permission"
                  | "agent_archive_requires_permission"
                  | "agent_restore_requires_permission"
                  | "agent_review_required"
                  | "agent_operation_not_supported"
                  | "asset_missing"
                  | "asset_not_public"
                  | "asset_policy_blocked"
                  | "asset_metadata_stale"
                  | "asset_alt_missing"
                  | "asset_caption_missing"
                  | "asset_ref_rebuild_failed"
                  | "asset_upload_pending"
                  | "relation_target_missing"
                  | "relation_target_not_public"
                  | "relation_locale_missing"
                  | "relation_collection_invalid"
                  | "relation_cycle_detected"
                  | "relation_validation_failed"
                  | "projection_public_entry_missing"
                  | "projection_public_route_missing"
                  | "projection_revision_missing"
                  | "projection_revision_locale_missing"
                  | "projection_rebuild_failed"
                  | "projection_route_mismatch"
                  | "projection_asset_ref_mismatch"
                  | "projection_cache_tags_missing"
                  | "revalidation_pending"
                  | "revalidation_failed"
                  | "revalidation_delivery_missing"
                  | "revalidation_adapter_unconfigured"
                  | "revalidation_cache_tag_missing"
                  | "revalidation_event_stale"
                  | "settings_missing"
                  | "collection_missing"
                  | "entry_missing"
                  | "entry_archived"
                  | "entry_collection_mismatch"
                  | "draft_version_conflict"
                  | "draft_hash_mismatch"
                  | "confirmation_missing"
                  | "confirmation_expired"
                  | "confirmation_mismatch";
                diagnosticId: string | null;
                fieldPath: string | null;
                locale: string | null;
                messageParams: Record<string, string | number | boolean | null>;
                severity: "blocker" | "warning" | "info";
              }>;
              canArchive: boolean;
              canPreview: boolean;
              canPublish: boolean;
              canRequestReview: boolean;
              currentDraftVersion: number | null;
              currentPublishedRevisionId: string | null;
              draftExists: boolean;
              draftUrl: string | null;
              hasUnpublishedChanges: boolean;
              infos: Array<{
                code:
                  | "required_field_missing"
                  | "required_localized_field_missing"
                  | "required_shared_field_missing"
                  | "body_required"
                  | "seo_title_required"
                  | "seo_description_required"
                  | "asset_alt_required"
                  | "asset_caption_required"
                  | "collection_schema_invalid"
                  | "data_only_required_field_missing"
                  | "locale_missing"
                  | "locale_not_configured"
                  | "primary_locale_missing"
                  | "default_locale_unknown"
                  | "fallback_not_configured"
                  | "locale_parent_missing"
                  | "locale_public_projection_missing"
                  | "locale_public_route_missing"
                  | "locale_slug_missing"
                  | "locale_switch_target_missing"
                  | "route_missing"
                  | "route_collision"
                  | "route_reserved"
                  | "route_invalid"
                  | "route_parent_not_public"
                  | "route_descendant_collision"
                  | "route_descendant_rebuild_failed"
                  | "route_cycle_detected"
                  | "route_depth_exceeded"
                  | "route_slug_unchanged_noop"
                  | "review_request_stale"
                  | "review_preview_stale"
                  | "review_preview_missing"
                  | "review_not_authorized"
                  | "review_already_closed"
                  | "review_publish_blocked"
                  | "review_locale_mismatch"
                  | "review_version_hash_mismatch"
                  | "permission_publish_missing"
                  | "permission_review_missing"
                  | "permission_archive_missing"
                  | "permission_restore_missing"
                  | "permission_agent_scope_missing"
                  | "permission_member_inactive"
                  | "permission_api_key_revoked"
                  | "permission_role_not_allowed"
                  | "agent_run_missing"
                  | "agent_run_not_owned"
                  | "agent_run_closed"
                  | "agent_publish_requires_permission"
                  | "agent_archive_requires_permission"
                  | "agent_restore_requires_permission"
                  | "agent_review_required"
                  | "agent_operation_not_supported"
                  | "asset_missing"
                  | "asset_not_public"
                  | "asset_policy_blocked"
                  | "asset_metadata_stale"
                  | "asset_alt_missing"
                  | "asset_caption_missing"
                  | "asset_ref_rebuild_failed"
                  | "asset_upload_pending"
                  | "relation_target_missing"
                  | "relation_target_not_public"
                  | "relation_locale_missing"
                  | "relation_collection_invalid"
                  | "relation_cycle_detected"
                  | "relation_validation_failed"
                  | "projection_public_entry_missing"
                  | "projection_public_route_missing"
                  | "projection_revision_missing"
                  | "projection_revision_locale_missing"
                  | "projection_rebuild_failed"
                  | "projection_route_mismatch"
                  | "projection_asset_ref_mismatch"
                  | "projection_cache_tags_missing"
                  | "revalidation_pending"
                  | "revalidation_failed"
                  | "revalidation_delivery_missing"
                  | "revalidation_adapter_unconfigured"
                  | "revalidation_cache_tag_missing"
                  | "revalidation_event_stale"
                  | "settings_missing"
                  | "collection_missing"
                  | "entry_missing"
                  | "entry_archived"
                  | "entry_collection_mismatch"
                  | "draft_version_conflict"
                  | "draft_hash_mismatch"
                  | "confirmation_missing"
                  | "confirmation_expired"
                  | "confirmation_mismatch";
                diagnosticId: string | null;
                fieldPath: string | null;
                locale: string | null;
                messageParams: Record<string, string | number | boolean | null>;
                severity: "blocker" | "warning" | "info";
              }>;
              locale: string;
              nextAction: {
                kind:
                  | "continue_editing"
                  | "fill_required_field"
                  | "fill_required_localized_field"
                  | "fill_required_shared_field"
                  | "add_locale"
                  | "publish_locale"
                  | "resolve_route_collision"
                  | "request_review"
                  | "open_review"
                  | "view_public_page";
                locale: string | null;
                params: Record<string, string | number | boolean | null>;
                target:
                  | "editor"
                  | "field"
                  | "locale"
                  | "route"
                  | "review"
                  | "publish";
              };
              publicUrl: string | null;
              published: boolean;
              reviewRequestId: string | null;
              state:
                | "draft"
                | "needs_work"
                | "ready"
                | "in_review"
                | "live"
                | "live_with_changes"
                | "missing";
              warnings: Array<{
                code:
                  | "required_field_missing"
                  | "required_localized_field_missing"
                  | "required_shared_field_missing"
                  | "body_required"
                  | "seo_title_required"
                  | "seo_description_required"
                  | "asset_alt_required"
                  | "asset_caption_required"
                  | "collection_schema_invalid"
                  | "data_only_required_field_missing"
                  | "locale_missing"
                  | "locale_not_configured"
                  | "primary_locale_missing"
                  | "default_locale_unknown"
                  | "fallback_not_configured"
                  | "locale_parent_missing"
                  | "locale_public_projection_missing"
                  | "locale_public_route_missing"
                  | "locale_slug_missing"
                  | "locale_switch_target_missing"
                  | "route_missing"
                  | "route_collision"
                  | "route_reserved"
                  | "route_invalid"
                  | "route_parent_not_public"
                  | "route_descendant_collision"
                  | "route_descendant_rebuild_failed"
                  | "route_cycle_detected"
                  | "route_depth_exceeded"
                  | "route_slug_unchanged_noop"
                  | "review_request_stale"
                  | "review_preview_stale"
                  | "review_preview_missing"
                  | "review_not_authorized"
                  | "review_already_closed"
                  | "review_publish_blocked"
                  | "review_locale_mismatch"
                  | "review_version_hash_mismatch"
                  | "permission_publish_missing"
                  | "permission_review_missing"
                  | "permission_archive_missing"
                  | "permission_restore_missing"
                  | "permission_agent_scope_missing"
                  | "permission_member_inactive"
                  | "permission_api_key_revoked"
                  | "permission_role_not_allowed"
                  | "agent_run_missing"
                  | "agent_run_not_owned"
                  | "agent_run_closed"
                  | "agent_publish_requires_permission"
                  | "agent_archive_requires_permission"
                  | "agent_restore_requires_permission"
                  | "agent_review_required"
                  | "agent_operation_not_supported"
                  | "asset_missing"
                  | "asset_not_public"
                  | "asset_policy_blocked"
                  | "asset_metadata_stale"
                  | "asset_alt_missing"
                  | "asset_caption_missing"
                  | "asset_ref_rebuild_failed"
                  | "asset_upload_pending"
                  | "relation_target_missing"
                  | "relation_target_not_public"
                  | "relation_locale_missing"
                  | "relation_collection_invalid"
                  | "relation_cycle_detected"
                  | "relation_validation_failed"
                  | "projection_public_entry_missing"
                  | "projection_public_route_missing"
                  | "projection_revision_missing"
                  | "projection_revision_locale_missing"
                  | "projection_rebuild_failed"
                  | "projection_route_mismatch"
                  | "projection_asset_ref_mismatch"
                  | "projection_cache_tags_missing"
                  | "revalidation_pending"
                  | "revalidation_failed"
                  | "revalidation_delivery_missing"
                  | "revalidation_adapter_unconfigured"
                  | "revalidation_cache_tag_missing"
                  | "revalidation_event_stale"
                  | "settings_missing"
                  | "collection_missing"
                  | "entry_missing"
                  | "entry_archived"
                  | "entry_collection_mismatch"
                  | "draft_version_conflict"
                  | "draft_hash_mismatch"
                  | "confirmation_missing"
                  | "confirmation_expired"
                  | "confirmation_mismatch";
                diagnosticId: string | null;
                fieldPath: string | null;
                locale: string | null;
                messageParams: Record<string, string | number | boolean | null>;
                severity: "blocker" | "warning" | "info";
              }>;
            }>;
            primaryLocale: string;
            updatedAt: number;
          },
          Name
        >;
        getEntryReadinessSummary: FunctionReference<
          "query",
          "internal",
          { entryId: string },
          {
            collection: string;
            entryId: string;
            locales: Array<{
              affectedPublicUrls: Array<{
                afterHref: string | null;
                afterPath: string | null;
                beforeHref: string | null;
                beforePath: string | null;
                entryId: string;
                kind: "current_entry" | "descendant";
                locale: string;
                reason:
                  | "publish"
                  | "route_changed"
                  | "parent_route_changed"
                  | "unpublish"
                  | "archive";
              }>;
              blockers: Array<{
                code:
                  | "required_field_missing"
                  | "required_localized_field_missing"
                  | "required_shared_field_missing"
                  | "body_required"
                  | "seo_title_required"
                  | "seo_description_required"
                  | "asset_alt_required"
                  | "asset_caption_required"
                  | "collection_schema_invalid"
                  | "data_only_required_field_missing"
                  | "locale_missing"
                  | "locale_not_configured"
                  | "primary_locale_missing"
                  | "default_locale_unknown"
                  | "fallback_not_configured"
                  | "locale_parent_missing"
                  | "locale_public_projection_missing"
                  | "locale_public_route_missing"
                  | "locale_slug_missing"
                  | "locale_switch_target_missing"
                  | "route_missing"
                  | "route_collision"
                  | "route_reserved"
                  | "route_invalid"
                  | "route_parent_not_public"
                  | "route_descendant_collision"
                  | "route_descendant_rebuild_failed"
                  | "route_cycle_detected"
                  | "route_depth_exceeded"
                  | "route_slug_unchanged_noop"
                  | "review_request_stale"
                  | "review_preview_stale"
                  | "review_preview_missing"
                  | "review_not_authorized"
                  | "review_already_closed"
                  | "review_publish_blocked"
                  | "review_locale_mismatch"
                  | "review_version_hash_mismatch"
                  | "permission_publish_missing"
                  | "permission_review_missing"
                  | "permission_archive_missing"
                  | "permission_restore_missing"
                  | "permission_agent_scope_missing"
                  | "permission_member_inactive"
                  | "permission_api_key_revoked"
                  | "permission_role_not_allowed"
                  | "agent_run_missing"
                  | "agent_run_not_owned"
                  | "agent_run_closed"
                  | "agent_publish_requires_permission"
                  | "agent_archive_requires_permission"
                  | "agent_restore_requires_permission"
                  | "agent_review_required"
                  | "agent_operation_not_supported"
                  | "asset_missing"
                  | "asset_not_public"
                  | "asset_policy_blocked"
                  | "asset_metadata_stale"
                  | "asset_alt_missing"
                  | "asset_caption_missing"
                  | "asset_ref_rebuild_failed"
                  | "asset_upload_pending"
                  | "relation_target_missing"
                  | "relation_target_not_public"
                  | "relation_locale_missing"
                  | "relation_collection_invalid"
                  | "relation_cycle_detected"
                  | "relation_validation_failed"
                  | "projection_public_entry_missing"
                  | "projection_public_route_missing"
                  | "projection_revision_missing"
                  | "projection_revision_locale_missing"
                  | "projection_rebuild_failed"
                  | "projection_route_mismatch"
                  | "projection_asset_ref_mismatch"
                  | "projection_cache_tags_missing"
                  | "revalidation_pending"
                  | "revalidation_failed"
                  | "revalidation_delivery_missing"
                  | "revalidation_adapter_unconfigured"
                  | "revalidation_cache_tag_missing"
                  | "revalidation_event_stale"
                  | "settings_missing"
                  | "collection_missing"
                  | "entry_missing"
                  | "entry_archived"
                  | "entry_collection_mismatch"
                  | "draft_version_conflict"
                  | "draft_hash_mismatch"
                  | "confirmation_missing"
                  | "confirmation_expired"
                  | "confirmation_mismatch";
                diagnosticId: string | null;
                fieldPath: string | null;
                locale: string | null;
                messageParams: Record<string, string | number | boolean | null>;
                severity: "blocker" | "warning" | "info";
              }>;
              canArchive: boolean;
              canPreview: boolean;
              canPublish: boolean;
              canRequestReview: boolean;
              currentDraftVersion: number | null;
              currentPublishedRevisionId: string | null;
              draftExists: boolean;
              draftUrl: string | null;
              hasUnpublishedChanges: boolean;
              infos: Array<{
                code:
                  | "required_field_missing"
                  | "required_localized_field_missing"
                  | "required_shared_field_missing"
                  | "body_required"
                  | "seo_title_required"
                  | "seo_description_required"
                  | "asset_alt_required"
                  | "asset_caption_required"
                  | "collection_schema_invalid"
                  | "data_only_required_field_missing"
                  | "locale_missing"
                  | "locale_not_configured"
                  | "primary_locale_missing"
                  | "default_locale_unknown"
                  | "fallback_not_configured"
                  | "locale_parent_missing"
                  | "locale_public_projection_missing"
                  | "locale_public_route_missing"
                  | "locale_slug_missing"
                  | "locale_switch_target_missing"
                  | "route_missing"
                  | "route_collision"
                  | "route_reserved"
                  | "route_invalid"
                  | "route_parent_not_public"
                  | "route_descendant_collision"
                  | "route_descendant_rebuild_failed"
                  | "route_cycle_detected"
                  | "route_depth_exceeded"
                  | "route_slug_unchanged_noop"
                  | "review_request_stale"
                  | "review_preview_stale"
                  | "review_preview_missing"
                  | "review_not_authorized"
                  | "review_already_closed"
                  | "review_publish_blocked"
                  | "review_locale_mismatch"
                  | "review_version_hash_mismatch"
                  | "permission_publish_missing"
                  | "permission_review_missing"
                  | "permission_archive_missing"
                  | "permission_restore_missing"
                  | "permission_agent_scope_missing"
                  | "permission_member_inactive"
                  | "permission_api_key_revoked"
                  | "permission_role_not_allowed"
                  | "agent_run_missing"
                  | "agent_run_not_owned"
                  | "agent_run_closed"
                  | "agent_publish_requires_permission"
                  | "agent_archive_requires_permission"
                  | "agent_restore_requires_permission"
                  | "agent_review_required"
                  | "agent_operation_not_supported"
                  | "asset_missing"
                  | "asset_not_public"
                  | "asset_policy_blocked"
                  | "asset_metadata_stale"
                  | "asset_alt_missing"
                  | "asset_caption_missing"
                  | "asset_ref_rebuild_failed"
                  | "asset_upload_pending"
                  | "relation_target_missing"
                  | "relation_target_not_public"
                  | "relation_locale_missing"
                  | "relation_collection_invalid"
                  | "relation_cycle_detected"
                  | "relation_validation_failed"
                  | "projection_public_entry_missing"
                  | "projection_public_route_missing"
                  | "projection_revision_missing"
                  | "projection_revision_locale_missing"
                  | "projection_rebuild_failed"
                  | "projection_route_mismatch"
                  | "projection_asset_ref_mismatch"
                  | "projection_cache_tags_missing"
                  | "revalidation_pending"
                  | "revalidation_failed"
                  | "revalidation_delivery_missing"
                  | "revalidation_adapter_unconfigured"
                  | "revalidation_cache_tag_missing"
                  | "revalidation_event_stale"
                  | "settings_missing"
                  | "collection_missing"
                  | "entry_missing"
                  | "entry_archived"
                  | "entry_collection_mismatch"
                  | "draft_version_conflict"
                  | "draft_hash_mismatch"
                  | "confirmation_missing"
                  | "confirmation_expired"
                  | "confirmation_mismatch";
                diagnosticId: string | null;
                fieldPath: string | null;
                locale: string | null;
                messageParams: Record<string, string | number | boolean | null>;
                severity: "blocker" | "warning" | "info";
              }>;
              locale: string;
              nextAction: {
                kind:
                  | "continue_editing"
                  | "fill_required_field"
                  | "fill_required_localized_field"
                  | "fill_required_shared_field"
                  | "add_locale"
                  | "publish_locale"
                  | "resolve_route_collision"
                  | "request_review"
                  | "open_review"
                  | "view_public_page";
                locale: string | null;
                params: Record<string, string | number | boolean | null>;
                target:
                  | "editor"
                  | "field"
                  | "locale"
                  | "route"
                  | "review"
                  | "publish";
              };
              publicUrl: string | null;
              published: boolean;
              reviewRequestId: string | null;
              state:
                | "draft"
                | "needs_work"
                | "ready"
                | "in_review"
                | "live"
                | "live_with_changes"
                | "missing";
              warnings: Array<{
                code:
                  | "required_field_missing"
                  | "required_localized_field_missing"
                  | "required_shared_field_missing"
                  | "body_required"
                  | "seo_title_required"
                  | "seo_description_required"
                  | "asset_alt_required"
                  | "asset_caption_required"
                  | "collection_schema_invalid"
                  | "data_only_required_field_missing"
                  | "locale_missing"
                  | "locale_not_configured"
                  | "primary_locale_missing"
                  | "default_locale_unknown"
                  | "fallback_not_configured"
                  | "locale_parent_missing"
                  | "locale_public_projection_missing"
                  | "locale_public_route_missing"
                  | "locale_slug_missing"
                  | "locale_switch_target_missing"
                  | "route_missing"
                  | "route_collision"
                  | "route_reserved"
                  | "route_invalid"
                  | "route_parent_not_public"
                  | "route_descendant_collision"
                  | "route_descendant_rebuild_failed"
                  | "route_cycle_detected"
                  | "route_depth_exceeded"
                  | "route_slug_unchanged_noop"
                  | "review_request_stale"
                  | "review_preview_stale"
                  | "review_preview_missing"
                  | "review_not_authorized"
                  | "review_already_closed"
                  | "review_publish_blocked"
                  | "review_locale_mismatch"
                  | "review_version_hash_mismatch"
                  | "permission_publish_missing"
                  | "permission_review_missing"
                  | "permission_archive_missing"
                  | "permission_restore_missing"
                  | "permission_agent_scope_missing"
                  | "permission_member_inactive"
                  | "permission_api_key_revoked"
                  | "permission_role_not_allowed"
                  | "agent_run_missing"
                  | "agent_run_not_owned"
                  | "agent_run_closed"
                  | "agent_publish_requires_permission"
                  | "agent_archive_requires_permission"
                  | "agent_restore_requires_permission"
                  | "agent_review_required"
                  | "agent_operation_not_supported"
                  | "asset_missing"
                  | "asset_not_public"
                  | "asset_policy_blocked"
                  | "asset_metadata_stale"
                  | "asset_alt_missing"
                  | "asset_caption_missing"
                  | "asset_ref_rebuild_failed"
                  | "asset_upload_pending"
                  | "relation_target_missing"
                  | "relation_target_not_public"
                  | "relation_locale_missing"
                  | "relation_collection_invalid"
                  | "relation_cycle_detected"
                  | "relation_validation_failed"
                  | "projection_public_entry_missing"
                  | "projection_public_route_missing"
                  | "projection_revision_missing"
                  | "projection_revision_locale_missing"
                  | "projection_rebuild_failed"
                  | "projection_route_mismatch"
                  | "projection_asset_ref_mismatch"
                  | "projection_cache_tags_missing"
                  | "revalidation_pending"
                  | "revalidation_failed"
                  | "revalidation_delivery_missing"
                  | "revalidation_adapter_unconfigured"
                  | "revalidation_cache_tag_missing"
                  | "revalidation_event_stale"
                  | "settings_missing"
                  | "collection_missing"
                  | "entry_missing"
                  | "entry_archived"
                  | "entry_collection_mismatch"
                  | "draft_version_conflict"
                  | "draft_hash_mismatch"
                  | "confirmation_missing"
                  | "confirmation_expired"
                  | "confirmation_mismatch";
                diagnosticId: string | null;
                fieldPath: string | null;
                locale: string | null;
                messageParams: Record<string, string | number | boolean | null>;
                severity: "blocker" | "warning" | "info";
              }>;
            }>;
            primaryLocale: string;
            updatedAt: number;
          },
          Name
        >;
      };
      studioInventory: {
        listEntriesForStudio: FunctionReference<
          "query",
          "internal",
          {
            _trustedCaller?:
              | { kind: "anonymous"; subject: "system:anonymous" }
              | {
                  email?: string;
                  emailVerified?: boolean;
                  kind: "user";
                  name?: string;
                  subject: string;
                  userId: string;
                }
              | {
                  clientId: string;
                  issuer: string;
                  kind: "mcp";
                  scopes: Array<string>;
                  subject: string;
                  userId: string;
                }
              | { deployId: string; kind: "deploy"; subject: string };
            collection: string;
            locale: string;
            paginationOpts: {
              cursor: string | null;
              endCursor?: string | null;
              id?: number;
              maximumBytesRead?: number;
              maximumRowsRead?: number;
              numItems: number;
            };
            parentEntryId: string | null;
            query?: string;
            status?: "draft" | "published" | "archived";
          },
          {
            continueCursor: string;
            isDone: boolean;
            page: Array<{
              _can?: Record<string, boolean>;
              _id: string;
              baseSlug: string;
              collection: string;
              createdAt: number;
              data: Record<
                string,
                _GinkoCmsJsonDepth8
              >;
              dirtyLocales: Array<string>;
              draftVersion: number;
              locale: string;
              localeSummaries: Array<{
                draftExists: boolean;
                draftPath: string;
                locale: string;
                published: boolean;
                publishedPath: string | null;
                updatedAt: number;
              }>;
              nodeKind: "page" | "folder" | "group" | "section";
              orderRank: string;
              parentEntryId: string | null;
              path: string;
              publishedAt: number | null;
              stableId: string | null;
              status: "draft" | "published" | "archived";
              title: string;
              updatedAt: number;
            }>;
          },
          Name
        >;
        listEntrySummaries: FunctionReference<
          "query",
          "internal",
          {
            collection: string;
            locale: string;
            paginationOpts: {
              cursor: string | null;
              endCursor?: string | null;
              id?: number;
              maximumBytesRead?: number;
              maximumRowsRead?: number;
              numItems: number;
            };
            query?: string;
            status?: "draft" | "published" | "archived";
            workState?:
              "all" | "changed" | "needs_attention" | "missing_translation";
          },
          {
            continueCursor: string;
            isDone: boolean;
            page: Array<{
              _can?: Record<string, boolean>;
              _id: string;
              blockingIssueCount: number;
              collection: string;
              collectionLabel: string | Record<string, string>;
              draftChangedSincePublish: boolean;
              entryId: string;
              localeReadiness: Array<{
                changed: boolean;
                draftPath: string;
                locale: string;
                published: boolean;
                publishedPath: string | null;
                state: "public" | "draft_only" | "changed";
              }>;
              missingTranslationLocales: Array<string>;
              nextAction: string;
              nodeKind: "page" | "folder" | "group" | "section";
              parentEntryId: string | null;
              path: string;
              publicState:
                "public" | "draft_only" | "needs_attention" | "data_only";
              publishedAt: number | null;
              routeMode: "route" | "none";
              slug: string;
              status: "draft" | "published" | "archived";
              title: string;
              updatedAt: number;
              workflowSummary: {
                collection: string;
                entryId: string;
                issueCounts: { blocker: number; info: number; warning: number };
                missingLocales: Array<string>;
                nextAction: {
                  kind:
                    | "continue_editing"
                    | "fill_required_field"
                    | "fill_required_localized_field"
                    | "fill_required_shared_field"
                    | "add_locale"
                    | "publish_locale"
                    | "resolve_route_collision"
                    | "request_review"
                    | "open_review"
                    | "view_public_page";
                  locale: string | null;
                  params: Record<string, string | number | boolean | null>;
                  target:
                    | "editor"
                    | "field"
                    | "locale"
                    | "route"
                    | "review"
                    | "publish";
                };
                primaryLocale: string;
                publishedLocales: Array<string>;
                readinessStatesByLocale: Record<
                  string,
                  | "draft"
                  | "needs_work"
                  | "ready"
                  | "in_review"
                  | "live"
                  | "live_with_changes"
                  | "missing"
                >;
                workStatesByLocale: Record<
                  string,
                  | "missing_translation"
                  | "blocked"
                  | "public"
                  | "changed"
                  | "draft"
                >;
              };
            }>;
          },
          Name
        >;
        resolveRelationEntries: FunctionReference<
          "query",
          "internal",
          {
            _trustedCaller?:
              | { kind: "anonymous"; subject: "system:anonymous" }
              | {
                  email?: string;
                  emailVerified?: boolean;
                  kind: "user";
                  name?: string;
                  subject: string;
                  userId: string;
                }
              | {
                  clientId: string;
                  issuer: string;
                  kind: "mcp";
                  scopes: Array<string>;
                  subject: string;
                  userId: string;
                }
              | { deployId: string; kind: "deploy"; subject: string };
            collection: string;
            locale: string;
            stableIds: Array<string>;
          },
          Array<{ _id: string; slug: string; stableId: string; title: string }>,
          Name
        >;
      };
      studioOverview: {
        getStudioOverview: FunctionReference<
          "query",
          "internal",
          { locale: string },
          {
            recentPublished: Array<{
              _can?: Record<string, boolean>;
              blockingIssueCount: number;
              collection: string;
              collectionLabel: string | Record<string, string>;
              entryId: string;
              missingTranslationLocales: Array<string>;
              nextAction: string;
              path: string;
              publicState:
                "public" | "draft_only" | "needs_attention" | "data_only";
              publishedAt: number | null;
              status: "draft" | "published" | "archived";
              title: string;
              updatedAt: number;
            }>;
            revalidationJobs: Array<{
              attempts: number;
              createdAt: number;
              id: string;
              lastError: string | null;
              paths: Array<string>;
              status: "pending" | "delivering" | "delivered" | "failed";
              updatedAt: number;
            }>;
          },
          Name
        >;
        listStudioWorkQueue: FunctionReference<
          "query",
          "internal",
          {
            locale: string;
            paginationOpts: {
              cursor: string | null;
              endCursor?: string | null;
              id?: number;
              maximumBytesRead?: number;
              maximumRowsRead?: number;
              numItems: number;
            };
          },
          {
            continueCursor: string;
            isDone: boolean;
            page: Array<{
              entry: {
                _can?: Record<string, boolean>;
                _id: string;
                blockingIssueCount: number;
                collection: string;
                collectionLabel: string | Record<string, string>;
                draftChangedSincePublish: boolean;
                entryId: string;
                localeReadiness: Array<{
                  changed: boolean;
                  draftPath: string;
                  locale: string;
                  published: boolean;
                  publishedPath: string | null;
                  state: "public" | "draft_only" | "changed";
                }>;
                missingTranslationLocales: Array<string>;
                nextAction: string;
                nodeKind: "page" | "folder" | "group" | "section";
                parentEntryId: string | null;
                path: string;
                publicState:
                  "public" | "draft_only" | "needs_attention" | "data_only";
                publishedAt: number | null;
                routeMode: "route" | "none";
                slug: string;
                status: "draft" | "published" | "archived";
                title: string;
                updatedAt: number;
                workflowSummary: {
                  collection: string;
                  entryId: string;
                  issueCounts: {
                    blocker: number;
                    info: number;
                    warning: number;
                  };
                  missingLocales: Array<string>;
                  nextAction: {
                    kind:
                      | "continue_editing"
                      | "fill_required_field"
                      | "fill_required_localized_field"
                      | "fill_required_shared_field"
                      | "add_locale"
                      | "publish_locale"
                      | "resolve_route_collision"
                      | "request_review"
                      | "open_review"
                      | "view_public_page";
                    locale: string | null;
                    params: Record<string, string | number | boolean | null>;
                    target:
                      | "editor"
                      | "field"
                      | "locale"
                      | "route"
                      | "review"
                      | "publish";
                  };
                  primaryLocale: string;
                  publishedLocales: Array<string>;
                  readinessStatesByLocale: Record<
                    string,
                    | "draft"
                    | "needs_work"
                    | "ready"
                    | "in_review"
                    | "live"
                    | "live_with_changes"
                    | "missing"
                  >;
                  workStatesByLocale: Record<
                    string,
                    | "missing_translation"
                    | "blocked"
                    | "public"
                    | "changed"
                    | "draft"
                  >;
                };
              };
              queueKinds: Array<
                "changed" | "needs_attention" | "missing_translation"
              >;
            }>;
          },
          Name
        >;
      };
      translationReview: {
        acknowledgeTranslationReview: FunctionReference<
          "mutation",
          "internal",
          {
            _expectedContentHash?: string;
            _expectedPresentationHash?: string;
            entryId: string;
            expectedReviewId: string | null;
            expectedSharedVersion: number;
            expectedSourceDraftId: string;
            expectedSourceVersion: number;
            expectedTargetDraftId: string;
            expectedTargetVersion: number;
            targetLocale: string;
          },
          string,
          Name
        >;
        getTranslationReview: FunctionReference<
          "query",
          "internal",
          { entryId: string; targetLocale: string },
          {
            _can: { edit: boolean };
            changedFields: Array<string>;
            changedTargetFields: Array<string>;
            entryId: string;
            reason:
              | "unreviewed"
              | "source-changed"
              | "target-changed"
              | "source-missing"
              | null;
            reviewId: string | null;
            reviewedAt: number | null;
            reviewedBy: string | null;
            reviewedSource: {
              bodyMdc: string;
              shared: Record<
                string,
                _GinkoCmsJsonDepth8
              >;
              slug: string | null;
              values: Record<
                string,
                _GinkoCmsJsonDepth8
              >;
            } | null;
            sharedVersion: number;
            source: {
              bodyMdc: string;
              shared: Record<
                string,
                _GinkoCmsJsonDepth8
              >;
              slug: string | null;
              values: Record<
                string,
                _GinkoCmsJsonDepth8
              >;
            } | null;
            sourceDraftId: string | null;
            sourceLocale: string | null;
            sourceVersion: number | null;
            status: "unknown" | "independent" | "needs-review" | "reviewed";
            target: {
              bodyMdc: string;
              shared: Record<
                string,
                _GinkoCmsJsonDepth8
              >;
              slug: string | null;
              values: Record<
                string,
                _GinkoCmsJsonDepth8
              >;
            };
            targetDraftId: string;
            targetLocale: string;
            targetVersion: number;
          },
          Name
        >;
        setTranslationSource: FunctionReference<
          "mutation",
          "internal",
          {
            _expectedContentHash?: string;
            _expectedPresentationHash?: string;
            entryId: string;
            expectedReviewId: string | null;
            expectedSharedVersion: number;
            expectedTargetDraftId: string;
            expectedTargetVersion: number;
            sourceLocale: string | null;
            targetLocale: string;
          },
          string,
          Name
        >;
      };
      tree: {
        createEntry: FunctionReference<
          "mutation",
          "internal",
          {
            _expectedContentHash?: string;
            _expectedPresentationHash?: string;
            bodyMdc?: string;
            collection: string;
            locale?: string;
            localized?: Record<
              string,
              _GinkoCmsJsonDepth8
            >;
            nodeKind?: "page" | "folder" | "group" | "section";
            orderRank?: string;
            parentEntryId?: string;
            shared?: Record<
              string,
              _GinkoCmsJsonDepth8
            >;
            slug: string;
            stagedAssetIds?: Array<string>;
          },
          string,
          Name
        >;
        duplicateEntry: FunctionReference<
          "mutation",
          "internal",
          {
            _expectedContentHash?: string;
            _expectedPresentationHash?: string;
            expectedSourceDraftVersion: number;
            sourceEntryId: string;
            variants: Array<{ locale: string; slug: string; title: string }>;
          },
          {
            draftVersion: number;
            entryId: string;
            locales: Array<string>;
            orderRank: string;
            parentEntryId: string | null;
            slug: string;
            stableId: string;
          },
          Name
        >;
        previewReorderEntryOperation: FunctionReference<
          "mutation",
          "internal",
          {
            _expectedContentHash?: string;
            _expectedPresentationHash?: string;
            afterEntryId?: string;
            beforeEntryId?: string;
            entryId: string;
            expectedDraftVersion: number;
            parentEntryId?: string;
          },
          {
            allowed: boolean;
            blockers: Array<{
              code: string;
              count?: number;
              details?: any;
              message: string;
              status?: "blocked" | "stale";
            }>;
            confirm: any;
            confirmation: { expiresAt: number; token: string } | null;
            details: any;
            effects: Array<{
              count?: number | null;
              countLabel?: string;
              kind: string;
              minimumCount?: number;
              summary: string;
            }>;
            summary: string;
            version: any;
            warnings: Array<{
              code: string;
              count?: number;
              details?: any;
              message: string;
              status?: "blocked" | "stale";
            }>;
          },
          Name
        >;
        previewReparentEntryOperation: FunctionReference<
          "mutation",
          "internal",
          {
            _expectedContentHash?: string;
            _expectedPresentationHash?: string;
            afterEntryId?: string;
            beforeEntryId?: string;
            entryId: string;
            expectedDraftVersion: number;
            parentEntryId?: string;
          },
          {
            allowed: boolean;
            blockers: Array<{
              code: string;
              count?: number;
              details?: any;
              message: string;
              status?: "blocked" | "stale";
            }>;
            confirm: any;
            confirmation: { expiresAt: number; token: string } | null;
            details: any;
            effects: Array<{
              count?: number | null;
              countLabel?: string;
              kind: string;
              minimumCount?: number;
              summary: string;
            }>;
            summary: string;
            version: any;
            warnings: Array<{
              code: string;
              count?: number;
              details?: any;
              message: string;
              status?: "blocked" | "stale";
            }>;
          },
          Name
        >;
        reorderEntryOperationExecute: FunctionReference<
          "mutation",
          "internal",
          {
            _confirmationToken?: string;
            _expectedContentHash?: string;
            _expectedPresentationHash?: string;
            afterEntryId?: string;
            beforeEntryId?: string;
            entryId: string;
            expectedDraftVersion: number;
            parentEntryId?: string;
          },
          | {
              status: "applied";
              value: {
                draftVersion: number;
                orderRank: string;
                parentEntryId: string | null;
              };
            }
          | { code: string; details: any; message: string; status: "blocked" }
          | { code: string; details: any; message: string; status: "stale" },
          Name
        >;
        reparentEntryOperationExecute: FunctionReference<
          "mutation",
          "internal",
          {
            _confirmationToken?: string;
            _expectedContentHash?: string;
            _expectedPresentationHash?: string;
            afterEntryId?: string;
            beforeEntryId?: string;
            entryId: string;
            expectedDraftVersion: number;
            parentEntryId?: string;
          },
          | {
              status: "applied";
              value: {
                draftVersion: number;
                orderRank: string;
                parentEntryId: string | null;
              };
            }
          | { code: string; details: any; message: string; status: "blocked" }
          | { code: string; details: any; message: string; status: "stale" },
          Name
        >;
      };
    };
    maintenance: {
      getProjectionRepairRun: FunctionReference<
        "query",
        "internal",
        { runId: string },
        {
          autoContinue: boolean;
          canonicalGeneration: number;
          completedAt: number | null;
          createdAt: number;
          createdBy: string;
          cursor: string | null;
          deletedOrphans: number;
          generation: number;
          inspectedAssetRefs: number;
          inspectedDraftSearchRows: number;
          inspectedPublicRows: number;
          issueCount: number;
          lastIssue: string | null;
          pageSize: number;
          phase:
            | "entries"
            | "drafts"
            | "revisions"
            | "draftSearchRows"
            | "publicRows"
            | "publicSearchRows"
            | "assetRefs"
            | "verifyEntries"
            | "verifyDrafts"
            | "verifyRevisions"
            | "verifyDraftSearchRows"
            | "verifyPublicRows"
            | "verifyPublicSearchRows"
            | "verifyAssetRefs";
          processedDrafts: number;
          processedEntries: number;
          processedRevisions: number;
          referencedAssetIds: Array<string>;
          repairedAssetRefSources: number;
          repairedDraftSearchRows: number;
          repairedPublicRows: number;
          runId: string;
          state: "running" | "complete" | "failed" | "dead";
          updatedAt: number;
          workAttempts: number;
          workDeadLetteredAt: number | null;
          workGeneration: number;
          workLastError: string | null;
          workLeaseExpiresAt: number | null;
          workNextAttemptAt: number | null;
          workToken: string | null;
        } | null,
        Name
      >;
      resumeProjectionRepairRun: FunctionReference<
        "mutation",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          autoContinue?: boolean;
          runId: string;
        },
        {
          autoContinue: boolean;
          canonicalGeneration: number;
          completedAt: number | null;
          createdAt: number;
          createdBy: string;
          cursor: string | null;
          deletedOrphans: number;
          generation: number;
          inspectedAssetRefs: number;
          inspectedDraftSearchRows: number;
          inspectedPublicRows: number;
          issueCount: number;
          lastIssue: string | null;
          pageSize: number;
          phase:
            | "entries"
            | "drafts"
            | "revisions"
            | "draftSearchRows"
            | "publicRows"
            | "publicSearchRows"
            | "assetRefs"
            | "verifyEntries"
            | "verifyDrafts"
            | "verifyRevisions"
            | "verifyDraftSearchRows"
            | "verifyPublicRows"
            | "verifyPublicSearchRows"
            | "verifyAssetRefs";
          processedDrafts: number;
          processedEntries: number;
          processedRevisions: number;
          referencedAssetIds: Array<string>;
          repairedAssetRefSources: number;
          repairedDraftSearchRows: number;
          repairedPublicRows: number;
          runId: string;
          state: "running" | "complete" | "failed" | "dead";
          updatedAt: number;
          workAttempts: number;
          workDeadLetteredAt: number | null;
          workGeneration: number;
          workLastError: string | null;
          workLeaseExpiresAt: number | null;
          workNextAttemptAt: number | null;
          workToken: string | null;
        },
        Name
      >;
      startProjectionRepairRun: FunctionReference<
        "mutation",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          autoContinue?: boolean;
          pageSize?: number;
          runId: string;
        },
        {
          autoContinue: boolean;
          canonicalGeneration: number;
          completedAt: number | null;
          createdAt: number;
          createdBy: string;
          cursor: string | null;
          deletedOrphans: number;
          generation: number;
          inspectedAssetRefs: number;
          inspectedDraftSearchRows: number;
          inspectedPublicRows: number;
          issueCount: number;
          lastIssue: string | null;
          pageSize: number;
          phase:
            | "entries"
            | "drafts"
            | "revisions"
            | "draftSearchRows"
            | "publicRows"
            | "publicSearchRows"
            | "assetRefs"
            | "verifyEntries"
            | "verifyDrafts"
            | "verifyRevisions"
            | "verifyDraftSearchRows"
            | "verifyPublicRows"
            | "verifyPublicSearchRows"
            | "verifyAssetRefs";
          processedDrafts: number;
          processedEntries: number;
          processedRevisions: number;
          referencedAssetIds: Array<string>;
          repairedAssetRefSources: number;
          repairedDraftSearchRows: number;
          repairedPublicRows: number;
          runId: string;
          state: "running" | "complete" | "failed" | "dead";
          updatedAt: number;
          workAttempts: number;
          workDeadLetteredAt: number | null;
          workGeneration: number;
          workLastError: string | null;
          workLeaseExpiresAt: number | null;
          workNextAttemptAt: number | null;
          workToken: string | null;
        },
        Name
      >;
    };
    mcpOAuthDelegations: {
      createDelegation: FunctionReference<
        "mutation",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          expiresAt?: number | null;
          label?: string | null;
          oauthClientId: string;
          ownerUserId: string;
          scopes: Array<"cms.read" | "cms.entries.edit">;
        },
        {
          _id: string;
          createdAt: number;
          createdBy: string;
          delegationId: string;
          expiresAt: number | null;
          label: string | null;
          oauthClientId: string;
          ownerUserId: string;
          revokedAt: number | null;
          scopes: Array<"cms.read" | "cms.entries.edit">;
          status: "active" | "revoked";
          updatedAt: number;
          updatedBy: string;
        },
        Name
      >;
      hasLiveDelegatedAccess: FunctionReference<
        "query",
        "internal",
        {
          oauthClientId: string;
          ownerUserId: string;
          scopes: Array<"cms.read" | "cms.entries.edit">;
        },
        boolean,
        Name
      >;
      hasOAuthAdminPrivilege: FunctionReference<
        "query",
        "internal",
        { authUserId: string },
        boolean,
        Name
      >;
      listDelegations: FunctionReference<
        "query",
        "internal",
        {},
        Array<{
          _id: string;
          createdAt: number;
          createdBy: string;
          delegationId: string;
          expiresAt: number | null;
          label: string | null;
          oauthClientId: string;
          ownerUserId: string;
          revokedAt: number | null;
          scopes: Array<"cms.read" | "cms.entries.edit">;
          status: "active" | "revoked";
          updatedAt: number;
          updatedBy: string;
        }>,
        Name
      >;
      revokeDelegation: FunctionReference<
        "mutation",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          delegationId: string;
        },
        null,
        Name
      >;
    };
    members: {
      acceptMemberInvitation: FunctionReference<
        "mutation",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          tokenProof: string;
        },
        {
          _id: string;
          createdAt: number;
          displayName: string | null;
          email: string | null;
          role: "owner" | "publisher" | "editor" | "viewer";
          updatedAt: number | null;
          updatedBy: string | null;
          userId: string;
        },
        Name
      >;
      bootstrapCmsOwner: FunctionReference<
        "mutation",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          configuredOwnerEmail?: string;
          displayName?: string;
        },
        {
          _id: string;
          createdAt: number;
          displayName: string | null;
          email: string | null;
          role: "owner" | "publisher" | "editor" | "viewer";
          updatedAt: number | null;
          updatedBy: string | null;
          userId: string;
        },
        Name
      >;
      getAccessContext: FunctionReference<
        "query",
        "internal",
        {
          _trustedCaller?:
            | { kind: "anonymous"; subject: "system:anonymous" }
            | {
                email?: string;
                emailVerified?: boolean;
                kind: "user";
                name?: string;
                subject: string;
                userId: string;
              }
            | {
                clientId: string;
                issuer: string;
                kind: "mcp";
                scopes: Array<string>;
                subject: string;
                userId: string;
              }
            | { deployId: string; kind: "deploy"; subject: string };
        },
        {
          can: Record<string, boolean>;
          canBootstrap: boolean;
          member: {
            _id: string;
            createdAt: number;
            displayName: string | null;
            email: string | null;
            role: "owner" | "publisher" | "editor" | "viewer";
            updatedAt: number | null;
            updatedBy: string | null;
            userId: string;
          } | null;
          role: "owner" | "publisher" | "editor" | "viewer" | null;
          userId: string | null;
        } | null,
        Name
      >;
      getMember: FunctionReference<
        "query",
        "internal",
        { userId: string },
        null | {
          _id: string;
          createdAt: number;
          displayName: string | null;
          email: string | null;
          role: "owner" | "publisher" | "editor" | "viewer";
          updatedAt: number | null;
          updatedBy: string | null;
          userId: string;
        },
        Name
      >;
      listMemberInvitations: FunctionReference<
        "query",
        "internal",
        {},
        Array<{
          createdAt: number;
          deliveredAt: number | null;
          deliveryState: "prepared" | "delivered" | "failed";
          email: string;
          expiresAt: number;
          generation: number;
          invitationId: string;
          role: "owner" | "publisher" | "editor" | "viewer";
          status: "pending" | "expired" | "delivery_failed";
          updatedAt: number;
        }>,
        Name
      >;
      listMembers: FunctionReference<
        "query",
        "internal",
        {},
        Array<{
          _id: string;
          createdAt: number;
          displayName: string | null;
          email: string | null;
          role: "owner" | "publisher" | "editor" | "viewer";
          updatedAt: number | null;
          updatedBy: string | null;
          userId: string;
        }>,
        Name
      >;
      prepareMemberInvitationDelivery: FunctionReference<
        "action",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          _trustedCaller?:
            | { kind: "anonymous"; subject: "system:anonymous" }
            | {
                email?: string;
                emailVerified?: boolean;
                kind: "user";
                name?: string;
                subject: string;
                userId: string;
              }
            | {
                clientId: string;
                issuer: string;
                kind: "mcp";
                scopes: Array<string>;
                subject: string;
                userId: string;
              }
            | { deployId: string; kind: "deploy"; subject: string };
          email: string;
          expiresInHours: number;
          role: "owner" | "publisher" | "editor" | "viewer";
          tokenHash: string;
        },
        {
          createdAt: number;
          deliveredAt: number | null;
          deliveryState: "prepared" | "delivered" | "failed";
          email: string;
          expiresAt: number;
          generation: number;
          invitationId: string;
          role: "owner" | "publisher" | "editor" | "viewer";
          status: "pending" | "expired" | "delivery_failed";
          updatedAt: number;
        },
        Name
      >;
      prepareMemberInvitationResendDelivery: FunctionReference<
        "action",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          _trustedCaller?:
            | { kind: "anonymous"; subject: "system:anonymous" }
            | {
                email?: string;
                emailVerified?: boolean;
                kind: "user";
                name?: string;
                subject: string;
                userId: string;
              }
            | {
                clientId: string;
                issuer: string;
                kind: "mcp";
                scopes: Array<string>;
                subject: string;
                userId: string;
              }
            | { deployId: string; kind: "deploy"; subject: string };
          expiresInHours: number;
          invitationId: string;
          tokenHash: string;
        },
        {
          createdAt: number;
          deliveredAt: number | null;
          deliveryState: "prepared" | "delivered" | "failed";
          email: string;
          expiresAt: number;
          generation: number;
          invitationId: string;
          role: "owner" | "publisher" | "editor" | "viewer";
          status: "pending" | "expired" | "delivery_failed";
          updatedAt: number;
        },
        Name
      >;
      previewRemoveMemberOperation: FunctionReference<
        "mutation",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          userId: string;
        },
        {
          allowed: boolean;
          blockers: Array<{
            code: string;
            count?: number;
            details?: any;
            message: string;
            status?: "blocked" | "stale";
          }>;
          confirm: any;
          confirmation: { expiresAt: number; token: string } | null;
          details: any;
          effects: Array<{
            count?: number | null;
            countLabel?: string;
            kind: string;
            minimumCount?: number;
            summary: string;
          }>;
          summary: string;
          version: any;
          warnings: Array<{
            code: string;
            count?: number;
            details?: any;
            message: string;
            status?: "blocked" | "stale";
          }>;
        },
        Name
      >;
      recordMemberInvitationDelivery: FunctionReference<
        "action",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          _trustedCaller?:
            | { kind: "anonymous"; subject: "system:anonymous" }
            | {
                email?: string;
                emailVerified?: boolean;
                kind: "user";
                name?: string;
                subject: string;
                userId: string;
              }
            | {
                clientId: string;
                issuer: string;
                kind: "mcp";
                scopes: Array<string>;
                subject: string;
                userId: string;
              }
            | { deployId: string; kind: "deploy"; subject: string };
          delivered: boolean;
          generation: number;
          invitationId: string;
        },
        {
          createdAt: number;
          deliveredAt: number | null;
          deliveryState: "prepared" | "delivered" | "failed";
          email: string;
          expiresAt: number;
          generation: number;
          invitationId: string;
          role: "owner" | "publisher" | "editor" | "viewer";
          status: "pending" | "expired" | "delivery_failed";
          updatedAt: number;
        },
        Name
      >;
      removeMemberOperationExecute: FunctionReference<
        "mutation",
        "internal",
        {
          _confirmationToken?: string;
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          userId: string;
        },
        | { status: "applied"; value: null }
        | { code: string; details: any; message: string; status: "blocked" }
        | { code: string; details: any; message: string; status: "stale" },
        Name
      >;
      revokeMemberInvitation: FunctionReference<
        "mutation",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          invitationId: string;
        },
        null,
        Name
      >;
      updateMemberRole: FunctionReference<
        "mutation",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          role: "owner" | "publisher" | "editor" | "viewer";
          userId: string;
        },
        null,
        Name
      >;
    };
    operations: {
      previewArchiveEntryOperation: FunctionReference<
        "mutation",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          entryId: string;
        },
        {
          allowed: boolean;
          blockers: Array<{
            code: string;
            count?: number;
            details?: any;
            message: string;
            status?: "blocked" | "stale";
          }>;
          confirm: any;
          confirmation: { expiresAt: number; token: string } | null;
          details: any;
          effects: Array<{
            count?: number | null;
            countLabel?: string;
            kind: string;
            minimumCount?: number;
            summary: string;
          }>;
          summary: string;
          version: any;
          warnings: Array<{
            code: string;
            count?: number;
            details?: any;
            message: string;
            status?: "blocked" | "stale";
          }>;
        },
        Name
      >;
      previewDeleteAssetOperation: FunctionReference<
        "mutation",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          _trustedCaller?:
            | { kind: "anonymous"; subject: "system:anonymous" }
            | {
                email?: string;
                emailVerified?: boolean;
                kind: "user";
                name?: string;
                subject: string;
                userId: string;
              }
            | {
                clientId: string;
                issuer: string;
                kind: "mcp";
                scopes: Array<string>;
                subject: string;
                userId: string;
              }
            | { deployId: string; kind: "deploy"; subject: string };
          assetId: string;
          force?: boolean;
        },
        {
          allowed: boolean;
          blockers: Array<{
            code: string;
            count?: number;
            details?: any;
            message: string;
            status?: "blocked" | "stale";
          }>;
          confirm: any;
          confirmation: { expiresAt: number; token: string } | null;
          details: any;
          effects: Array<{
            count?: number | null;
            countLabel?: string;
            kind: string;
            minimumCount?: number;
            summary: string;
          }>;
          summary: string;
          version: any;
          warnings: Array<{
            code: string;
            count?: number;
            details?: any;
            message: string;
            status?: "blocked" | "stale";
          }>;
        },
        Name
      >;
      previewDeleteAssetRecoveryArtifactOperation: FunctionReference<
        "mutation",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          artifactId: string;
        },
        {
          allowed: boolean;
          blockers: Array<{
            code: string;
            count?: number;
            details?: any;
            message: string;
            status?: "blocked" | "stale";
          }>;
          confirm: any;
          confirmation: { expiresAt: number; token: string } | null;
          details: any;
          effects: Array<{
            count?: number | null;
            countLabel?: string;
            kind: string;
            minimumCount?: number;
            summary: string;
          }>;
          summary: string;
          version: any;
          warnings: Array<{
            code: string;
            count?: number;
            details?: any;
            message: string;
            status?: "blocked" | "stale";
          }>;
        },
        Name
      >;
      previewDeleteSiteDataBlockOperation: FunctionReference<
        "mutation",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          _trustedCaller?:
            | { kind: "anonymous"; subject: "system:anonymous" }
            | {
                email?: string;
                emailVerified?: boolean;
                kind: "user";
                name?: string;
                subject: string;
                userId: string;
              }
            | {
                clientId: string;
                issuer: string;
                kind: "mcp";
                scopes: Array<string>;
                subject: string;
                userId: string;
              }
            | { deployId: string; kind: "deploy"; subject: string };
          key: string;
        },
        {
          allowed: boolean;
          blockers: Array<{
            code: string;
            count?: number;
            details?: any;
            message: string;
            status?: "blocked" | "stale";
          }>;
          confirm: any;
          confirmation: { expiresAt: number; token: string } | null;
          details: any;
          effects: Array<{
            count?: number | null;
            countLabel?: string;
            kind: string;
            minimumCount?: number;
            summary: string;
          }>;
          summary: string;
          version: any;
          warnings: Array<{
            code: string;
            count?: number;
            details?: any;
            message: string;
            status?: "blocked" | "stale";
          }>;
        },
        Name
      >;
      previewPermanentlyDeleteEntryOperation: FunctionReference<
        "mutation",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          confirmationPhrase: string;
          entryId: string;
        },
        {
          allowed: boolean;
          blockers: Array<{
            code: string;
            count?: number;
            details?: any;
            message: string;
            status?: "blocked" | "stale";
          }>;
          confirm: any;
          confirmation: { expiresAt: number; token: string } | null;
          details: any;
          effects: Array<{
            count?: number | null;
            countLabel?: string;
            kind: string;
            minimumCount?: number;
            summary: string;
          }>;
          summary: string;
          version: any;
          warnings: Array<{
            code: string;
            count?: number;
            details?: any;
            message: string;
            status?: "blocked" | "stale";
          }>;
        },
        Name
      >;
      previewPublishEntryOperation: FunctionReference<
        "mutation",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          entryId: string;
          expectedVersion: number;
          locales: Array<string>;
          message?: string;
        },
        {
          allowed: boolean;
          blockers: Array<{
            code: string;
            count?: number;
            details?: any;
            message: string;
            status?: "blocked" | "stale";
          }>;
          confirm: any;
          confirmation: { expiresAt: number; token: string } | null;
          details: any;
          effects: Array<{
            count?: number | null;
            countLabel?: string;
            kind: string;
            minimumCount?: number;
            summary: string;
          }>;
          summary: string;
          version: any;
          warnings: Array<{
            code: string;
            count?: number;
            details?: any;
            message: string;
            status?: "blocked" | "stale";
          }>;
        },
        Name
      >;
      previewPurgeAssetOperation: FunctionReference<
        "mutation",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          _trustedCaller?:
            | { kind: "anonymous"; subject: "system:anonymous" }
            | {
                email?: string;
                emailVerified?: boolean;
                kind: "user";
                name?: string;
                subject: string;
                userId: string;
              }
            | {
                clientId: string;
                issuer: string;
                kind: "mcp";
                scopes: Array<string>;
                subject: string;
                userId: string;
              }
            | { deployId: string; kind: "deploy"; subject: string };
          assetId: string;
          recoveryArtifactId: string;
        },
        {
          allowed: boolean;
          blockers: Array<{
            code: string;
            count?: number;
            details?: any;
            message: string;
            status?: "blocked" | "stale";
          }>;
          confirm: any;
          confirmation: { expiresAt: number; token: string } | null;
          details: any;
          effects: Array<{
            count?: number | null;
            countLabel?: string;
            kind: string;
            minimumCount?: number;
            summary: string;
          }>;
          summary: string;
          version: any;
          warnings: Array<{
            code: string;
            count?: number;
            details?: any;
            message: string;
            status?: "blocked" | "stale";
          }>;
        },
        Name
      >;
      previewRemoveMemberOperation: FunctionReference<
        "mutation",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          userId: string;
        },
        {
          allowed: boolean;
          blockers: Array<{
            code: string;
            count?: number;
            details?: any;
            message: string;
            status?: "blocked" | "stale";
          }>;
          confirm: any;
          confirmation: { expiresAt: number; token: string } | null;
          details: any;
          effects: Array<{
            count?: number | null;
            countLabel?: string;
            kind: string;
            minimumCount?: number;
            summary: string;
          }>;
          summary: string;
          version: any;
          warnings: Array<{
            code: string;
            count?: number;
            details?: any;
            message: string;
            status?: "blocked" | "stale";
          }>;
        },
        Name
      >;
      previewReplaceAssetOperation: FunctionReference<
        "mutation",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          _trustedCaller?:
            | { kind: "anonymous"; subject: "system:anonymous" }
            | {
                email?: string;
                emailVerified?: boolean;
                kind: "user";
                name?: string;
                subject: string;
                userId: string;
              }
            | {
                clientId: string;
                issuer: string;
                kind: "mcp";
                scopes: Array<string>;
                subject: string;
                userId: string;
              }
            | { deployId: string; kind: "deploy"; subject: string };
          assetId: string;
          sessionId: string;
        },
        {
          allowed: boolean;
          blockers: Array<{
            code: string;
            count?: number;
            details?: any;
            message: string;
            status?: "blocked" | "stale";
          }>;
          confirm: any;
          confirmation: { expiresAt: number; token: string } | null;
          details: any;
          effects: Array<{
            count?: number | null;
            countLabel?: string;
            kind: string;
            minimumCount?: number;
            summary: string;
          }>;
          summary: string;
          version: any;
          warnings: Array<{
            code: string;
            count?: number;
            details?: any;
            message: string;
            status?: "blocked" | "stale";
          }>;
        },
        Name
      >;
      previewRetireRedirectOperation: FunctionReference<
        "mutation",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          redirectId: string;
        },
        {
          allowed: boolean;
          blockers: Array<{
            code: string;
            count?: number;
            details?: any;
            message: string;
            status?: "blocked" | "stale";
          }>;
          confirm: any;
          confirmation: { expiresAt: number; token: string } | null;
          details: any;
          effects: Array<{
            count?: number | null;
            countLabel?: string;
            kind: string;
            minimumCount?: number;
            summary: string;
          }>;
          summary: string;
          version: any;
          warnings: Array<{
            code: string;
            count?: number;
            details?: any;
            message: string;
            status?: "blocked" | "stale";
          }>;
        },
        Name
      >;
      previewRetryRevalidationJobOperation: FunctionReference<
        "mutation",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          eventId: string;
        },
        {
          allowed: boolean;
          blockers: Array<{
            code: string;
            count?: number;
            details?: any;
            message: string;
            status?: "blocked" | "stale";
          }>;
          confirm: any;
          confirmation: { expiresAt: number; token: string } | null;
          details: any;
          effects: Array<{
            count?: number | null;
            countLabel?: string;
            kind: string;
            minimumCount?: number;
            summary: string;
          }>;
          summary: string;
          version: any;
          warnings: Array<{
            code: string;
            count?: number;
            details?: any;
            message: string;
            status?: "blocked" | "stale";
          }>;
        },
        Name
      >;
      previewRevertDraftToPublishedOperation: FunctionReference<
        "mutation",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          entryId: string;
        },
        {
          allowed: boolean;
          blockers: Array<{
            code: string;
            count?: number;
            details?: any;
            message: string;
            status?: "blocked" | "stale";
          }>;
          confirm: any;
          confirmation: { expiresAt: number; token: string } | null;
          details: any;
          effects: Array<{
            count?: number | null;
            countLabel?: string;
            kind: string;
            minimumCount?: number;
            summary: string;
          }>;
          summary: string;
          version: any;
          warnings: Array<{
            code: string;
            count?: number;
            details?: any;
            message: string;
            status?: "blocked" | "stale";
          }>;
        },
        Name
      >;
      previewRollbackVersionOperation: FunctionReference<
        "mutation",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          entryId: string;
          publish?: boolean;
          versionId: string;
        },
        {
          allowed: boolean;
          blockers: Array<{
            code: string;
            count?: number;
            details?: any;
            message: string;
            status?: "blocked" | "stale";
          }>;
          confirm: any;
          confirmation: { expiresAt: number; token: string } | null;
          details: any;
          effects: Array<{
            count?: number | null;
            countLabel?: string;
            kind: string;
            minimumCount?: number;
            summary: string;
          }>;
          summary: string;
          version: any;
          warnings: Array<{
            code: string;
            count?: number;
            details?: any;
            message: string;
            status?: "blocked" | "stale";
          }>;
        },
        Name
      >;
      previewUnpublishEntryOperation: FunctionReference<
        "mutation",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          entryId: string;
          locales: Array<string>;
        },
        {
          allowed: boolean;
          blockers: Array<{
            code: string;
            count?: number;
            details?: any;
            message: string;
            status?: "blocked" | "stale";
          }>;
          confirm: any;
          confirmation: { expiresAt: number; token: string } | null;
          details: any;
          effects: Array<{
            count?: number | null;
            countLabel?: string;
            kind: string;
            minimumCount?: number;
            summary: string;
          }>;
          summary: string;
          version: any;
          warnings: Array<{
            code: string;
            count?: number;
            details?: any;
            message: string;
            status?: "blocked" | "stale";
          }>;
        },
        Name
      >;
    };
    portability: {
      abortExportRun: FunctionReference<
        "mutation",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          runId: string;
        },
        { state: "aborted" },
        Name
      >;
      abortImport: FunctionReference<
        "mutation",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          payloadSha256: string;
          runId: string;
        },
        { runId: string; state: string },
        Name
      >;
      appendImportPlanAssets: FunctionReference<
        "mutation",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          assets: Array<{
            assetKey: string;
            inputSha256: string;
            payload: Record<
              string,
              _GinkoCmsJsonDepth8
            >;
          }>;
          payloadSha256: string;
          planId: string;
        },
        { accepted: number },
        Name
      >;
      appendImportPlanItems: FunctionReference<
        "mutation",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          items: Array<{
            applyOrder: number;
            document: Record<
              string,
              _GinkoCmsJsonDepth8
            >;
            inputSha256: string;
            itemKey: string;
            payload: Record<
              string,
              _GinkoCmsJsonDepth8
            >;
          }>;
          payloadSha256: string;
          planId: string;
        },
        { accepted: number },
        Name
      >;
      applyImportBatch: FunctionReference<
        "action",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          _trustedCaller?:
            | { kind: "anonymous"; subject: "system:anonymous" }
            | {
                email?: string;
                emailVerified?: boolean;
                kind: "user";
                name?: string;
                subject: string;
                userId: string;
              }
            | {
                clientId: string;
                issuer: string;
                kind: "mcp";
                scopes: Array<string>;
                subject: string;
                userId: string;
              }
            | { deployId: string; kind: "deploy"; subject: string };
          payloadSha256: string;
          runId: string;
        },
        { committed: number; complete: boolean },
        Name
      >;
      assets: {
        beginPortableAssetUpload: FunctionReference<
          "mutation",
          "internal",
          {
            _expectedContentHash?: string;
            _expectedPresentationHash?: string;
            attemptTokenHash: string;
            payloadSha256: string;
            runId: string;
            sha256: string;
            storageOrigin: string;
          },
          | {
              attemptGeneration: number;
              leaseExpiresAt: number;
              runId: string;
              sha256: string;
              state: "attempt";
            }
          | { assetId: string; state: "attached" },
          Name
        >;
        issuePortableAssetUploadUrl: FunctionReference<
          "mutation",
          "internal",
          {
            _expectedContentHash?: string;
            _expectedPresentationHash?: string;
            attemptGeneration: number;
            attemptTokenHash: string;
            payloadSha256: string;
            runId: string;
            sha256: string;
          },
          | {
              byteLength: number;
              mediaType:
                "image/png" | "image/jpeg" | "image/gif" | "image/webp";
              state: "awaiting-upload";
              storageOrigin: string;
              uploadUrl: string;
            }
          | { state: "uploaded" | "verifying" }
          | { assetId: string; state: "attached" },
          Name
        >;
        recordPortableAssetUpload: FunctionReference<
          "mutation",
          "internal",
          {
            _expectedContentHash?: string;
            _expectedPresentationHash?: string;
            attemptGeneration: number;
            attemptTokenHash: string;
            payloadSha256: string;
            runId: string;
            sha256: string;
            storageId: string;
          },
          { runId: string; sha256: string; state: "uploaded" },
          Name
        >;
        verifyPortableAssetUpload: FunctionReference<
          "action",
          "internal",
          {
            _expectedContentHash?: string;
            _expectedPresentationHash?: string;
            _trustedCaller?:
              | { kind: "anonymous"; subject: "system:anonymous" }
              | {
                  email?: string;
                  emailVerified?: boolean;
                  kind: "user";
                  name?: string;
                  subject: string;
                  userId: string;
                }
              | {
                  clientId: string;
                  issuer: string;
                  kind: "mcp";
                  scopes: Array<string>;
                  subject: string;
                  userId: string;
                }
              | { deployId: string; kind: "deploy"; subject: string };
            attemptGeneration: number;
            attemptTokenHash: string;
            payloadSha256: string;
            runId: string;
            sha256: string;
          },
          { assetId: string; state: "attached" },
          Name
        >;
      };
      beginImportApply: FunctionReference<
        "mutation",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          payloadSha256: string;
          runId: string;
        },
        { runId: string; state: string },
        Name
      >;
      beginImportVerification: FunctionReference<
        "mutation",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          payloadSha256: string;
          runId: string;
        },
        { runId: string; state: string },
        Name
      >;
      beginPortableAssetDownload: FunctionReference<
        "mutation",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          downloadTokenHash: string;
          holdId: string;
          runId: string;
        },
        { downloadGeneration: number; expiresAt: number; state: "attempt" },
        Name
      >;
      beginPortableAssetUpload: FunctionReference<
        "mutation",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          attemptTokenHash: string;
          payloadSha256: string;
          runId: string;
          sha256: string;
          storageOrigin: string;
        },
        | {
            attemptGeneration: number;
            leaseExpiresAt: number;
            runId: string;
            sha256: string;
            state: "attempt";
          }
        | { assetId: string; state: "attached" },
        Name
      >;
      captureExportPage: FunctionReference<
        "mutation",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          leaseGeneration: number;
          leaseTokenHash: string;
          runId: string;
        },
        { captured: number; complete: boolean },
        Name
      >;
      claimPortableAssetDownload: FunctionReference<
        "mutation",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          downloadGeneration: number;
          downloadTokenHash: string;
          holdId: string;
          runId: string;
        },
        {
          attempt: number;
          bytes: number;
          mediaType: string;
          sha256: string;
          storageUrl: string;
        },
        Name
      >;
      completeExportRun: FunctionReference<
        "mutation",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          assetCount: number;
          documentCount: number;
          manifestSha256: string;
          runId: string;
        },
        {
          assetCount: number;
          documentCount: number;
          manifestSha256: string;
          state: "complete";
        },
        Name
      >;
      createExportRun: FunctionReference<
        "action",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          _trustedCaller?:
            | { kind: "anonymous"; subject: "system:anonymous" }
            | {
                email?: string;
                emailVerified?: boolean;
                kind: "user";
                name?: string;
                subject: string;
                userId: string;
              }
            | {
                clientId: string;
                issuer: string;
                kind: "mcp";
                scopes: Array<string>;
                subject: string;
                userId: string;
              }
            | { deployId: string; kind: "deploy"; subject: string };
          deploymentId: string;
          leaseTokenHash: string;
          runId: string;
          scope: { collections: Array<string> };
          sourceContentHash: string;
        },
        {
          expiresAt: number;
          leaseGeneration: number;
          payloadSha256: string;
          preflight: { assetCount: number; documentCount: number };
          runId: string;
          state: "capturing";
        },
        Name
      >;
      createImportPlan: FunctionReference<
        "mutation",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          payload: Record<
            string,
            _GinkoCmsJsonDepth8
          >;
          payloadSha256: string;
          planId: string;
        },
        { expiresAt: number; payloadSha256: string; planId: string },
        Name
      >;
      expireExportRun: FunctionReference<
        "mutation",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          runId: string;
        },
        { state: "expired" },
        Name
      >;
      expireImport: FunctionReference<
        "mutation",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          payloadSha256: string;
          runId: string;
        },
        { runId: string; state: string },
        Name
      >;
      exportPreflight: {
        createExportRun: FunctionReference<
          "action",
          "internal",
          {
            _expectedContentHash?: string;
            _expectedPresentationHash?: string;
            _trustedCaller?:
              | { kind: "anonymous"; subject: "system:anonymous" }
              | {
                  email?: string;
                  emailVerified?: boolean;
                  kind: "user";
                  name?: string;
                  subject: string;
                  userId: string;
                }
              | {
                  clientId: string;
                  issuer: string;
                  kind: "mcp";
                  scopes: Array<string>;
                  subject: string;
                  userId: string;
                }
              | { deployId: string; kind: "deploy"; subject: string };
            deploymentId: string;
            leaseTokenHash: string;
            runId: string;
            scope: { collections: Array<string> };
            sourceContentHash: string;
          },
          {
            expiresAt: number;
            leaseGeneration: number;
            payloadSha256: string;
            preflight: { assetCount: number; documentCount: number };
            runId: string;
            state: "capturing";
          },
          Name
        >;
      };
      exports: {
        abortExportRun: FunctionReference<
          "mutation",
          "internal",
          {
            _expectedContentHash?: string;
            _expectedPresentationHash?: string;
            runId: string;
          },
          { state: "aborted" },
          Name
        >;
        beginPortableAssetDownload: FunctionReference<
          "mutation",
          "internal",
          {
            _expectedContentHash?: string;
            _expectedPresentationHash?: string;
            downloadTokenHash: string;
            holdId: string;
            runId: string;
          },
          { downloadGeneration: number; expiresAt: number; state: "attempt" },
          Name
        >;
        captureExportPage: FunctionReference<
          "mutation",
          "internal",
          {
            _expectedContentHash?: string;
            _expectedPresentationHash?: string;
            leaseGeneration: number;
            leaseTokenHash: string;
            runId: string;
          },
          { captured: number; complete: boolean },
          Name
        >;
        claimPortableAssetDownload: FunctionReference<
          "mutation",
          "internal",
          {
            _expectedContentHash?: string;
            _expectedPresentationHash?: string;
            downloadGeneration: number;
            downloadTokenHash: string;
            holdId: string;
            runId: string;
          },
          {
            attempt: number;
            bytes: number;
            mediaType: string;
            sha256: string;
            storageUrl: string;
          },
          Name
        >;
        completeExportRun: FunctionReference<
          "mutation",
          "internal",
          {
            _expectedContentHash?: string;
            _expectedPresentationHash?: string;
            assetCount: number;
            documentCount: number;
            manifestSha256: string;
            runId: string;
          },
          {
            assetCount: number;
            documentCount: number;
            manifestSha256: string;
            state: "complete";
          },
          Name
        >;
        expireExportRun: FunctionReference<
          "mutation",
          "internal",
          {
            _expectedContentHash?: string;
            _expectedPresentationHash?: string;
            runId: string;
          },
          { state: "expired" },
          Name
        >;
        readExportAssets: FunctionReference<
          "query",
          "internal",
          { cursor: string | null; limit: number; runId: string },
          {
            assets: Array<{
              bytes: number;
              holdId: string;
              mediaType: string;
              originalFilename: string;
              sha256: string;
            }>;
            cursor: string | null;
          },
          Name
        >;
        readExportDocuments: FunctionReference<
          "query",
          "internal",
          { cursor: string | null; limit: number; runId: string },
          {
            cursor: string | null;
            documents: Array<{
              document: Record<
                string,
                _GinkoCmsJsonDepth8
              >;
              documentSha256: string;
            }>;
          },
          Name
        >;
        sealExportRun: FunctionReference<
          "mutation",
          "internal",
          {
            _expectedContentHash?: string;
            _expectedPresentationHash?: string;
            leaseGeneration: number;
            leaseTokenHash: string;
            runId: string;
          },
          { assetCount: number; documentCount: number; state: "ready" },
          Name
        >;
      };
      finalizeImport: FunctionReference<
        "mutation",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          payloadSha256: string;
          runId: string;
        },
        {
          assetCount: number;
          completedAt: number;
          documentCount: number;
          payloadSha256: string;
          runId: string;
        },
        Name
      >;
      getPortabilityRunStatus: FunctionReference<
        "query",
        "internal",
        { runId: string },
        {
          assetCount: number;
          attachedAssetCount: number;
          attempts: number;
          committedItemCount: number;
          completedAt: number | null;
          deadLetteredAt: number | null;
          generation: number;
          itemCount: number;
          itemReceipts: Array<{
            committedAt: number | null;
            effect: string | null;
            index: number;
            itemKey: string;
            outcome: "applied" | "blocked" | "failed" | "pending" | "skipped";
            resultId: string | null;
            state: string;
          }>;
          lastError: string | null;
          leaseExpiresAt: number | null;
          mode: "import" | "export";
          nextAttemptAt: number | null;
          phase: string | null;
          runId: string;
          state: string;
        },
        Name
      >;
      inspectImportPublicationEntries: FunctionReference<
        "query",
        "internal",
        {
          entries: Array<{
            canonicalKey: string;
            collection: string;
            entryId: string;
            locales: Array<string>;
          }>;
          payloadSha256: string;
          runId: string;
        },
        {
          entries: Array<{
            draftSha256: string;
            entryId: string;
            expectedVersion: number;
            locales: Array<string>;
            pendingLocales: Array<string>;
          }>;
        },
        Name
      >;
      inspectPortableAssets: FunctionReference<
        "query",
        "internal",
        {
          assets: Array<{
            bytes: number;
            mediaType: "image/png" | "image/jpeg" | "image/gif" | "image/webp";
            sha256: string;
          }>;
        },
        Array<{
          current: { assetId: string; bytes: number; mediaType: string } | null;
          sha256: string;
        }>,
        Name
      >;
      inspectPortableDrafts: FunctionReference<
        "query",
        "internal",
        {
          items: Array<{
            identity: {
              canonicalKey: string;
              collection: string;
              locale: string;
            };
            itemKey: string;
          }>;
        },
        Array<{
          currentDraftSha256: string | null;
          currentSharedSha256: string | null;
          itemKey: string;
        }>,
        Name
      >;
      issuePortableAssetUploadUrl: FunctionReference<
        "mutation",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          attemptGeneration: number;
          attemptTokenHash: string;
          payloadSha256: string;
          runId: string;
          sha256: string;
        },
        | {
            byteLength: number;
            mediaType: "image/png" | "image/jpeg" | "image/gif" | "image/webp";
            state: "awaiting-upload";
            storageOrigin: string;
            uploadUrl: string;
          }
        | { state: "uploaded" | "verifying" }
        | { assetId: string; state: "attached" },
        Name
      >;
      listImportPublicationIdentities: FunctionReference<
        "query",
        "internal",
        {
          cursor: number | null;
          limit: number;
          payloadSha256: string;
          runId: string;
        },
        {
          cursor: number | null;
          identities: Array<{
            canonicalKey: string;
            collection: string;
            entryId: string;
            locale: string;
          }>;
        },
        Name
      >;
      listPortabilityItemReceipts: FunctionReference<
        "query",
        "internal",
        {
          cursor: number | null;
          filter: "all" | "failed" | "blocked" | "skipped";
          limit: number;
          runId: string;
        },
        {
          cursor: number | null;
          receipts: Array<{
            committedAt: number | null;
            effect: string | null;
            index: number;
            itemKey: string;
            outcome: "applied" | "blocked" | "failed" | "pending" | "skipped";
            resultId: string | null;
            state: string;
          }>;
        },
        Name
      >;
      readExportAssets: FunctionReference<
        "query",
        "internal",
        { cursor: string | null; limit: number; runId: string },
        {
          assets: Array<{
            bytes: number;
            holdId: string;
            mediaType: string;
            originalFilename: string;
            sha256: string;
          }>;
          cursor: string | null;
        },
        Name
      >;
      readExportDocuments: FunctionReference<
        "query",
        "internal",
        { cursor: string | null; limit: number; runId: string },
        {
          cursor: string | null;
          documents: Array<{
            document: Record<
              string,
              _GinkoCmsJsonDepth8
            >;
            documentSha256: string;
          }>;
        },
        Name
      >;
      recordPortableAssetUpload: FunctionReference<
        "mutation",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          attemptGeneration: number;
          attemptTokenHash: string;
          payloadSha256: string;
          runId: string;
          sha256: string;
          storageId: string;
        },
        { runId: string; sha256: string; state: "uploaded" },
        Name
      >;
      resumePortabilityRun: FunctionReference<
        "action",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          _trustedCaller?:
            | { kind: "anonymous"; subject: "system:anonymous" }
            | {
                email?: string;
                emailVerified?: boolean;
                kind: "user";
                name?: string;
                subject: string;
                userId: string;
              }
            | {
                clientId: string;
                issuer: string;
                kind: "mcp";
                scopes: Array<string>;
                subject: string;
                userId: string;
              }
            | { deployId: string; kind: "deploy"; subject: string };
          runId: string;
        },
        {
          assetCount: number;
          attachedAssetCount: number;
          attempts: number;
          committedItemCount: number;
          completedAt: number | null;
          deadLetteredAt: number | null;
          generation: number;
          itemCount: number;
          itemReceipts: Array<{
            committedAt: number | null;
            effect: string | null;
            index: number;
            itemKey: string;
            outcome: "applied" | "blocked" | "failed" | "pending" | "skipped";
            resultId: string | null;
            state: string;
          }>;
          lastError: string | null;
          leaseExpiresAt: number | null;
          mode: "import" | "export";
          nextAttemptAt: number | null;
          phase: string | null;
          runId: string;
          state: string;
        },
        Name
      >;
      runs: {
        abortImport: FunctionReference<
          "mutation",
          "internal",
          {
            _expectedContentHash?: string;
            _expectedPresentationHash?: string;
            payloadSha256: string;
            runId: string;
          },
          { runId: string; state: string },
          Name
        >;
        appendImportPlanAssets: FunctionReference<
          "mutation",
          "internal",
          {
            _expectedContentHash?: string;
            _expectedPresentationHash?: string;
            assets: Array<{
              assetKey: string;
              inputSha256: string;
              payload: Record<
                string,
                _GinkoCmsJsonDepth8
              >;
            }>;
            payloadSha256: string;
            planId: string;
          },
          { accepted: number },
          Name
        >;
        appendImportPlanItems: FunctionReference<
          "mutation",
          "internal",
          {
            _expectedContentHash?: string;
            _expectedPresentationHash?: string;
            items: Array<{
              applyOrder: number;
              document: Record<
                string,
                _GinkoCmsJsonDepth8
              >;
              inputSha256: string;
              itemKey: string;
              payload: Record<
                string,
                _GinkoCmsJsonDepth8
              >;
            }>;
            payloadSha256: string;
            planId: string;
          },
          { accepted: number },
          Name
        >;
        applyImportBatch: FunctionReference<
          "action",
          "internal",
          {
            _expectedContentHash?: string;
            _expectedPresentationHash?: string;
            _trustedCaller?:
              | { kind: "anonymous"; subject: "system:anonymous" }
              | {
                  email?: string;
                  emailVerified?: boolean;
                  kind: "user";
                  name?: string;
                  subject: string;
                  userId: string;
                }
              | {
                  clientId: string;
                  issuer: string;
                  kind: "mcp";
                  scopes: Array<string>;
                  subject: string;
                  userId: string;
                }
              | { deployId: string; kind: "deploy"; subject: string };
            payloadSha256: string;
            runId: string;
          },
          { committed: number; complete: boolean },
          Name
        >;
        beginImportApply: FunctionReference<
          "mutation",
          "internal",
          {
            _expectedContentHash?: string;
            _expectedPresentationHash?: string;
            payloadSha256: string;
            runId: string;
          },
          { runId: string; state: string },
          Name
        >;
        beginImportVerification: FunctionReference<
          "mutation",
          "internal",
          {
            _expectedContentHash?: string;
            _expectedPresentationHash?: string;
            payloadSha256: string;
            runId: string;
          },
          { runId: string; state: string },
          Name
        >;
        createImportPlan: FunctionReference<
          "mutation",
          "internal",
          {
            _expectedContentHash?: string;
            _expectedPresentationHash?: string;
            payload: Record<
              string,
              _GinkoCmsJsonDepth8
            >;
            payloadSha256: string;
            planId: string;
          },
          { expiresAt: number; payloadSha256: string; planId: string },
          Name
        >;
        expireImport: FunctionReference<
          "mutation",
          "internal",
          {
            _expectedContentHash?: string;
            _expectedPresentationHash?: string;
            payloadSha256: string;
            runId: string;
          },
          { runId: string; state: string },
          Name
        >;
        finalizeImport: FunctionReference<
          "mutation",
          "internal",
          {
            _expectedContentHash?: string;
            _expectedPresentationHash?: string;
            payloadSha256: string;
            runId: string;
          },
          {
            assetCount: number;
            completedAt: number;
            documentCount: number;
            payloadSha256: string;
            runId: string;
          },
          Name
        >;
        getPortabilityRunStatus: FunctionReference<
          "query",
          "internal",
          { runId: string },
          {
            assetCount: number;
            attachedAssetCount: number;
            attempts: number;
            committedItemCount: number;
            completedAt: number | null;
            deadLetteredAt: number | null;
            generation: number;
            itemCount: number;
            itemReceipts: Array<{
              committedAt: number | null;
              effect: string | null;
              index: number;
              itemKey: string;
              outcome: "applied" | "blocked" | "failed" | "pending" | "skipped";
              resultId: string | null;
              state: string;
            }>;
            lastError: string | null;
            leaseExpiresAt: number | null;
            mode: "import" | "export";
            nextAttemptAt: number | null;
            phase: string | null;
            runId: string;
            state: string;
          },
          Name
        >;
        inspectImportPublicationEntries: FunctionReference<
          "query",
          "internal",
          {
            entries: Array<{
              canonicalKey: string;
              collection: string;
              entryId: string;
              locales: Array<string>;
            }>;
            payloadSha256: string;
            runId: string;
          },
          {
            entries: Array<{
              draftSha256: string;
              entryId: string;
              expectedVersion: number;
              locales: Array<string>;
              pendingLocales: Array<string>;
            }>;
          },
          Name
        >;
        inspectPortableAssets: FunctionReference<
          "query",
          "internal",
          {
            assets: Array<{
              bytes: number;
              mediaType:
                "image/png" | "image/jpeg" | "image/gif" | "image/webp";
              sha256: string;
            }>;
          },
          Array<{
            current: {
              assetId: string;
              bytes: number;
              mediaType: string;
            } | null;
            sha256: string;
          }>,
          Name
        >;
        inspectPortableDrafts: FunctionReference<
          "query",
          "internal",
          {
            items: Array<{
              identity: {
                canonicalKey: string;
                collection: string;
                locale: string;
              };
              itemKey: string;
            }>;
          },
          Array<{
            currentDraftSha256: string | null;
            currentSharedSha256: string | null;
            itemKey: string;
          }>,
          Name
        >;
        listImportPublicationIdentities: FunctionReference<
          "query",
          "internal",
          {
            cursor: number | null;
            limit: number;
            payloadSha256: string;
            runId: string;
          },
          {
            cursor: number | null;
            identities: Array<{
              canonicalKey: string;
              collection: string;
              entryId: string;
              locale: string;
            }>;
          },
          Name
        >;
        listPortabilityItemReceipts: FunctionReference<
          "query",
          "internal",
          {
            cursor: number | null;
            filter: "all" | "failed" | "blocked" | "skipped";
            limit: number;
            runId: string;
          },
          {
            cursor: number | null;
            receipts: Array<{
              committedAt: number | null;
              effect: string | null;
              index: number;
              itemKey: string;
              outcome: "applied" | "blocked" | "failed" | "pending" | "skipped";
              resultId: string | null;
              state: string;
            }>;
          },
          Name
        >;
        resumePortabilityRun: FunctionReference<
          "action",
          "internal",
          {
            _expectedContentHash?: string;
            _expectedPresentationHash?: string;
            _trustedCaller?:
              | { kind: "anonymous"; subject: "system:anonymous" }
              | {
                  email?: string;
                  emailVerified?: boolean;
                  kind: "user";
                  name?: string;
                  subject: string;
                  userId: string;
                }
              | {
                  clientId: string;
                  issuer: string;
                  kind: "mcp";
                  scopes: Array<string>;
                  subject: string;
                  userId: string;
                }
              | { deployId: string; kind: "deploy"; subject: string };
            runId: string;
          },
          {
            assetCount: number;
            attachedAssetCount: number;
            attempts: number;
            committedItemCount: number;
            completedAt: number | null;
            deadLetteredAt: number | null;
            generation: number;
            itemCount: number;
            itemReceipts: Array<{
              committedAt: number | null;
              effect: string | null;
              index: number;
              itemKey: string;
              outcome: "applied" | "blocked" | "failed" | "pending" | "skipped";
              resultId: string | null;
              state: string;
            }>;
            lastError: string | null;
            leaseExpiresAt: number | null;
            mode: "import" | "export";
            nextAttemptAt: number | null;
            phase: string | null;
            runId: string;
            state: string;
          },
          Name
        >;
        sealImportPlan: FunctionReference<
          "action",
          "internal",
          {
            _expectedContentHash?: string;
            _expectedPresentationHash?: string;
            _trustedCaller?:
              | { kind: "anonymous"; subject: "system:anonymous" }
              | {
                  email?: string;
                  emailVerified?: boolean;
                  kind: "user";
                  name?: string;
                  subject: string;
                  userId: string;
                }
              | {
                  clientId: string;
                  issuer: string;
                  kind: "mcp";
                  scopes: Array<string>;
                  subject: string;
                  userId: string;
                }
              | { deployId: string; kind: "deploy"; subject: string };
            payloadSha256: string;
            planId: string;
          },
          { runId: string; state: string },
          Name
        >;
      };
      sealExportRun: FunctionReference<
        "mutation",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          leaseGeneration: number;
          leaseTokenHash: string;
          runId: string;
        },
        { assetCount: number; documentCount: number; state: "ready" },
        Name
      >;
      sealImportPlan: FunctionReference<
        "action",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          _trustedCaller?:
            | { kind: "anonymous"; subject: "system:anonymous" }
            | {
                email?: string;
                emailVerified?: boolean;
                kind: "user";
                name?: string;
                subject: string;
                userId: string;
              }
            | {
                clientId: string;
                issuer: string;
                kind: "mcp";
                scopes: Array<string>;
                subject: string;
                userId: string;
              }
            | { deployId: string; kind: "deploy"; subject: string };
          payloadSha256: string;
          planId: string;
        },
        { runId: string; state: string },
        Name
      >;
      verifyPortableAssetUpload: FunctionReference<
        "action",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          _trustedCaller?:
            | { kind: "anonymous"; subject: "system:anonymous" }
            | {
                email?: string;
                emailVerified?: boolean;
                kind: "user";
                name?: string;
                subject: string;
                userId: string;
              }
            | {
                clientId: string;
                issuer: string;
                kind: "mcp";
                scopes: Array<string>;
                subject: string;
                userId: string;
              }
            | { deployId: string; kind: "deploy"; subject: string };
          attemptGeneration: number;
          attemptTokenHash: string;
          payloadSha256: string;
          runId: string;
          sha256: string;
        },
        { assetId: string; state: "attached" },
        Name
      >;
    };
    public: {
      count: FunctionReference<
        "query",
        "internal",
        { collection: string; locale: string; pathPrefix?: string },
        number,
        Name
      >;
      list: FunctionReference<
        "query",
        "internal",
        {
          collection: string;
          cursor?: string | null;
          limit?: number;
          locale: string;
          pathPrefix?: string;
          sort?: string;
        },
        {
          protocol: "ginko-content-cms/v1";
          result: {
            collection: string;
            entries: Array<{
              assetFacts: Array<{
                assetId: string;
                bytes: number;
                expiresAt: number | null;
                fieldPath: string;
                mediaType:
                  "image/png" | "image/jpeg" | "image/gif" | "image/webp";
                sha256: string;
                url: string;
              }>;
              bodyAst?: any;
              bodyAstJson?: string;
              collection: string;
              data: Record<
                string,
                _GinkoCmsJsonDepth8
              >;
              id: string;
              locale: {
                fallbacks: { fields: Array<{ from: string; path: string }> };
                policy: "strict" | "transparent";
                requested: string;
                resolved: string;
              };
              publishedAt: string;
              revision: string;
              route: {
                href?: string;
                locale: string;
                path: string;
                slug: string;
                source: "published";
              };
              stableId: string;
              title: string;
              toc?:
                _GinkoCmsJsonDepth8;
              translations: Array<{
                locale: string;
                route: {
                  href?: string;
                  locale: string;
                  path: string;
                  slug: string;
                  source: "published";
                };
                status: "published" | "missing";
              }>;
              updatedAt: string;
            }>;
            locale: {
              fallbacks: { fields: Array<{ from: string; path: string }> };
              policy: "strict" | "transparent";
              requested: string;
              resolved: string;
            };
            pageInfo: { endCursor: string | null; hasNextPage: boolean };
          };
        },
        Name
      >;
      nav: FunctionReference<
        "query",
        "internal",
        { collection: string; locale: string },
        {
          protocol: "ginko-content-cms/v1";
          result: {
            collection: string;
            locale: {
              fallbacks: { fields: Array<{ from: string; path: string }> };
              policy: "strict" | "transparent";
              requested: string;
              resolved: string;
            };
            tree: Array<{
              children: Array<{
                children: Array<{
                  children: Array<{
                    children: Array<{
                      children: Array<{
                        children: Array<{
                          children: Array<{
                            children: Array<{
                              children: Array<{
                                children: Array<{
                                  children: Array<{
                                    children: Array<{
                                      children: Array<
                                        Record<
                                          string,
                                          _GinkoCmsJsonDepth8
                                        >
                                      >;
                                      entry: {
                                        assetFacts: Array<{
                                          assetId: string;
                                          bytes: number;
                                          expiresAt: number | null;
                                          fieldPath: string;
                                          mediaType:
                                            | "image/png"
                                            | "image/jpeg"
                                            | "image/gif"
                                            | "image/webp";
                                          sha256: string;
                                          url: string;
                                        }>;
                                        collection: string;
                                        data: Record<
                                          string,
                                          _GinkoCmsJsonDepth8
                                        >;
                                        id: string;
                                        locale: {
                                          fallbacks: {
                                            fields: Array<{
                                              from: string;
                                              path: string;
                                            }>;
                                          };
                                          policy: "strict" | "transparent";
                                          requested: string;
                                          resolved: string;
                                        };
                                        publishedAt: string;
                                        revision: string;
                                        route: {
                                          href?: string;
                                          locale: string;
                                          path: string;
                                          slug: string;
                                          source: "published";
                                        };
                                        stableId: string;
                                        title: string;
                                        translations: Array<{
                                          locale: string;
                                          route: {
                                            href?: string;
                                            locale: string;
                                            path: string;
                                            slug: string;
                                            source: "published";
                                          };
                                          status: "published" | "missing";
                                        }>;
                                        updatedAt: string;
                                      };
                                    }>;
                                    entry: {
                                      assetFacts: Array<{
                                        assetId: string;
                                        bytes: number;
                                        expiresAt: number | null;
                                        fieldPath: string;
                                        mediaType:
                                          | "image/png"
                                          | "image/jpeg"
                                          | "image/gif"
                                          | "image/webp";
                                        sha256: string;
                                        url: string;
                                      }>;
                                      collection: string;
                                      data: Record<
                                        string,
                                        _GinkoCmsJsonDepth8
                                      >;
                                      id: string;
                                      locale: {
                                        fallbacks: {
                                          fields: Array<{
                                            from: string;
                                            path: string;
                                          }>;
                                        };
                                        policy: "strict" | "transparent";
                                        requested: string;
                                        resolved: string;
                                      };
                                      publishedAt: string;
                                      revision: string;
                                      route: {
                                        href?: string;
                                        locale: string;
                                        path: string;
                                        slug: string;
                                        source: "published";
                                      };
                                      stableId: string;
                                      title: string;
                                      translations: Array<{
                                        locale: string;
                                        route: {
                                          href?: string;
                                          locale: string;
                                          path: string;
                                          slug: string;
                                          source: "published";
                                        };
                                        status: "published" | "missing";
                                      }>;
                                      updatedAt: string;
                                    };
                                  }>;
                                  entry: {
                                    assetFacts: Array<{
                                      assetId: string;
                                      bytes: number;
                                      expiresAt: number | null;
                                      fieldPath: string;
                                      mediaType:
                                        | "image/png"
                                        | "image/jpeg"
                                        | "image/gif"
                                        | "image/webp";
                                      sha256: string;
                                      url: string;
                                    }>;
                                    collection: string;
                                    data: Record<
                                      string,
                                      _GinkoCmsJsonDepth8
                                    >;
                                    id: string;
                                    locale: {
                                      fallbacks: {
                                        fields: Array<{
                                          from: string;
                                          path: string;
                                        }>;
                                      };
                                      policy: "strict" | "transparent";
                                      requested: string;
                                      resolved: string;
                                    };
                                    publishedAt: string;
                                    revision: string;
                                    route: {
                                      href?: string;
                                      locale: string;
                                      path: string;
                                      slug: string;
                                      source: "published";
                                    };
                                    stableId: string;
                                    title: string;
                                    translations: Array<{
                                      locale: string;
                                      route: {
                                        href?: string;
                                        locale: string;
                                        path: string;
                                        slug: string;
                                        source: "published";
                                      };
                                      status: "published" | "missing";
                                    }>;
                                    updatedAt: string;
                                  };
                                }>;
                                entry: {
                                  assetFacts: Array<{
                                    assetId: string;
                                    bytes: number;
                                    expiresAt: number | null;
                                    fieldPath: string;
                                    mediaType:
                                      | "image/png"
                                      | "image/jpeg"
                                      | "image/gif"
                                      | "image/webp";
                                    sha256: string;
                                    url: string;
                                  }>;
                                  collection: string;
                                  data: Record<
                                    string,
                                    _GinkoCmsJsonDepth8
                                  >;
                                  id: string;
                                  locale: {
                                    fallbacks: {
                                      fields: Array<{
                                        from: string;
                                        path: string;
                                      }>;
                                    };
                                    policy: "strict" | "transparent";
                                    requested: string;
                                    resolved: string;
                                  };
                                  publishedAt: string;
                                  revision: string;
                                  route: {
                                    href?: string;
                                    locale: string;
                                    path: string;
                                    slug: string;
                                    source: "published";
                                  };
                                  stableId: string;
                                  title: string;
                                  translations: Array<{
                                    locale: string;
                                    route: {
                                      href?: string;
                                      locale: string;
                                      path: string;
                                      slug: string;
                                      source: "published";
                                    };
                                    status: "published" | "missing";
                                  }>;
                                  updatedAt: string;
                                };
                              }>;
                              entry: {
                                assetFacts: Array<{
                                  assetId: string;
                                  bytes: number;
                                  expiresAt: number | null;
                                  fieldPath: string;
                                  mediaType:
                                    | "image/png"
                                    | "image/jpeg"
                                    | "image/gif"
                                    | "image/webp";
                                  sha256: string;
                                  url: string;
                                }>;
                                collection: string;
                                data: Record<
                                  string,
                                  _GinkoCmsJsonDepth8
                                >;
                                id: string;
                                locale: {
                                  fallbacks: {
                                    fields: Array<{
                                      from: string;
                                      path: string;
                                    }>;
                                  };
                                  policy: "strict" | "transparent";
                                  requested: string;
                                  resolved: string;
                                };
                                publishedAt: string;
                                revision: string;
                                route: {
                                  href?: string;
                                  locale: string;
                                  path: string;
                                  slug: string;
                                  source: "published";
                                };
                                stableId: string;
                                title: string;
                                translations: Array<{
                                  locale: string;
                                  route: {
                                    href?: string;
                                    locale: string;
                                    path: string;
                                    slug: string;
                                    source: "published";
                                  };
                                  status: "published" | "missing";
                                }>;
                                updatedAt: string;
                              };
                            }>;
                            entry: {
                              assetFacts: Array<{
                                assetId: string;
                                bytes: number;
                                expiresAt: number | null;
                                fieldPath: string;
                                mediaType:
                                  | "image/png"
                                  | "image/jpeg"
                                  | "image/gif"
                                  | "image/webp";
                                sha256: string;
                                url: string;
                              }>;
                              collection: string;
                              data: Record<
                                string,
                                _GinkoCmsJsonDepth8
                              >;
                              id: string;
                              locale: {
                                fallbacks: {
                                  fields: Array<{ from: string; path: string }>;
                                };
                                policy: "strict" | "transparent";
                                requested: string;
                                resolved: string;
                              };
                              publishedAt: string;
                              revision: string;
                              route: {
                                href?: string;
                                locale: string;
                                path: string;
                                slug: string;
                                source: "published";
                              };
                              stableId: string;
                              title: string;
                              translations: Array<{
                                locale: string;
                                route: {
                                  href?: string;
                                  locale: string;
                                  path: string;
                                  slug: string;
                                  source: "published";
                                };
                                status: "published" | "missing";
                              }>;
                              updatedAt: string;
                            };
                          }>;
                          entry: {
                            assetFacts: Array<{
                              assetId: string;
                              bytes: number;
                              expiresAt: number | null;
                              fieldPath: string;
                              mediaType:
                                | "image/png"
                                | "image/jpeg"
                                | "image/gif"
                                | "image/webp";
                              sha256: string;
                              url: string;
                            }>;
                            collection: string;
                            data: Record<
                              string,
                              _GinkoCmsJsonDepth8
                            >;
                            id: string;
                            locale: {
                              fallbacks: {
                                fields: Array<{ from: string; path: string }>;
                              };
                              policy: "strict" | "transparent";
                              requested: string;
                              resolved: string;
                            };
                            publishedAt: string;
                            revision: string;
                            route: {
                              href?: string;
                              locale: string;
                              path: string;
                              slug: string;
                              source: "published";
                            };
                            stableId: string;
                            title: string;
                            translations: Array<{
                              locale: string;
                              route: {
                                href?: string;
                                locale: string;
                                path: string;
                                slug: string;
                                source: "published";
                              };
                              status: "published" | "missing";
                            }>;
                            updatedAt: string;
                          };
                        }>;
                        entry: {
                          assetFacts: Array<{
                            assetId: string;
                            bytes: number;
                            expiresAt: number | null;
                            fieldPath: string;
                            mediaType:
                              | "image/png"
                              | "image/jpeg"
                              | "image/gif"
                              | "image/webp";
                            sha256: string;
                            url: string;
                          }>;
                          collection: string;
                          data: Record<
                            string,
                            _GinkoCmsJsonDepth8
                          >;
                          id: string;
                          locale: {
                            fallbacks: {
                              fields: Array<{ from: string; path: string }>;
                            };
                            policy: "strict" | "transparent";
                            requested: string;
                            resolved: string;
                          };
                          publishedAt: string;
                          revision: string;
                          route: {
                            href?: string;
                            locale: string;
                            path: string;
                            slug: string;
                            source: "published";
                          };
                          stableId: string;
                          title: string;
                          translations: Array<{
                            locale: string;
                            route: {
                              href?: string;
                              locale: string;
                              path: string;
                              slug: string;
                              source: "published";
                            };
                            status: "published" | "missing";
                          }>;
                          updatedAt: string;
                        };
                      }>;
                      entry: {
                        assetFacts: Array<{
                          assetId: string;
                          bytes: number;
                          expiresAt: number | null;
                          fieldPath: string;
                          mediaType:
                            | "image/png"
                            | "image/jpeg"
                            | "image/gif"
                            | "image/webp";
                          sha256: string;
                          url: string;
                        }>;
                        collection: string;
                        data: Record<
                          string,
                          _GinkoCmsJsonDepth8
                        >;
                        id: string;
                        locale: {
                          fallbacks: {
                            fields: Array<{ from: string; path: string }>;
                          };
                          policy: "strict" | "transparent";
                          requested: string;
                          resolved: string;
                        };
                        publishedAt: string;
                        revision: string;
                        route: {
                          href?: string;
                          locale: string;
                          path: string;
                          slug: string;
                          source: "published";
                        };
                        stableId: string;
                        title: string;
                        translations: Array<{
                          locale: string;
                          route: {
                            href?: string;
                            locale: string;
                            path: string;
                            slug: string;
                            source: "published";
                          };
                          status: "published" | "missing";
                        }>;
                        updatedAt: string;
                      };
                    }>;
                    entry: {
                      assetFacts: Array<{
                        assetId: string;
                        bytes: number;
                        expiresAt: number | null;
                        fieldPath: string;
                        mediaType:
                          | "image/png"
                          | "image/jpeg"
                          | "image/gif"
                          | "image/webp";
                        sha256: string;
                        url: string;
                      }>;
                      collection: string;
                      data: Record<
                        string,
                        _GinkoCmsJsonDepth8
                      >;
                      id: string;
                      locale: {
                        fallbacks: {
                          fields: Array<{ from: string; path: string }>;
                        };
                        policy: "strict" | "transparent";
                        requested: string;
                        resolved: string;
                      };
                      publishedAt: string;
                      revision: string;
                      route: {
                        href?: string;
                        locale: string;
                        path: string;
                        slug: string;
                        source: "published";
                      };
                      stableId: string;
                      title: string;
                      translations: Array<{
                        locale: string;
                        route: {
                          href?: string;
                          locale: string;
                          path: string;
                          slug: string;
                          source: "published";
                        };
                        status: "published" | "missing";
                      }>;
                      updatedAt: string;
                    };
                  }>;
                  entry: {
                    assetFacts: Array<{
                      assetId: string;
                      bytes: number;
                      expiresAt: number | null;
                      fieldPath: string;
                      mediaType:
                        "image/png" | "image/jpeg" | "image/gif" | "image/webp";
                      sha256: string;
                      url: string;
                    }>;
                    collection: string;
                    data: Record<
                      string,
                      _GinkoCmsJsonDepth8
                    >;
                    id: string;
                    locale: {
                      fallbacks: {
                        fields: Array<{ from: string; path: string }>;
                      };
                      policy: "strict" | "transparent";
                      requested: string;
                      resolved: string;
                    };
                    publishedAt: string;
                    revision: string;
                    route: {
                      href?: string;
                      locale: string;
                      path: string;
                      slug: string;
                      source: "published";
                    };
                    stableId: string;
                    title: string;
                    translations: Array<{
                      locale: string;
                      route: {
                        href?: string;
                        locale: string;
                        path: string;
                        slug: string;
                        source: "published";
                      };
                      status: "published" | "missing";
                    }>;
                    updatedAt: string;
                  };
                }>;
                entry: {
                  assetFacts: Array<{
                    assetId: string;
                    bytes: number;
                    expiresAt: number | null;
                    fieldPath: string;
                    mediaType:
                      "image/png" | "image/jpeg" | "image/gif" | "image/webp";
                    sha256: string;
                    url: string;
                  }>;
                  collection: string;
                  data: Record<
                    string,
                    _GinkoCmsJsonDepth8
                  >;
                  id: string;
                  locale: {
                    fallbacks: {
                      fields: Array<{ from: string; path: string }>;
                    };
                    policy: "strict" | "transparent";
                    requested: string;
                    resolved: string;
                  };
                  publishedAt: string;
                  revision: string;
                  route: {
                    href?: string;
                    locale: string;
                    path: string;
                    slug: string;
                    source: "published";
                  };
                  stableId: string;
                  title: string;
                  translations: Array<{
                    locale: string;
                    route: {
                      href?: string;
                      locale: string;
                      path: string;
                      slug: string;
                      source: "published";
                    };
                    status: "published" | "missing";
                  }>;
                  updatedAt: string;
                };
              }>;
              entry: {
                assetFacts: Array<{
                  assetId: string;
                  bytes: number;
                  expiresAt: number | null;
                  fieldPath: string;
                  mediaType:
                    "image/png" | "image/jpeg" | "image/gif" | "image/webp";
                  sha256: string;
                  url: string;
                }>;
                collection: string;
                data: Record<
                  string,
                  _GinkoCmsJsonDepth8
                >;
                id: string;
                locale: {
                  fallbacks: { fields: Array<{ from: string; path: string }> };
                  policy: "strict" | "transparent";
                  requested: string;
                  resolved: string;
                };
                publishedAt: string;
                revision: string;
                route: {
                  href?: string;
                  locale: string;
                  path: string;
                  slug: string;
                  source: "published";
                };
                stableId: string;
                title: string;
                translations: Array<{
                  locale: string;
                  route: {
                    href?: string;
                    locale: string;
                    path: string;
                    slug: string;
                    source: "published";
                  };
                  status: "published" | "missing";
                }>;
                updatedAt: string;
              };
            }>;
          };
        },
        Name
      >;
      page: FunctionReference<
        "query",
        "internal",
        {
          collection: string;
          fallback?: boolean | Array<string>;
          locale: string;
          path?: string;
          ref?: string;
        },
        {
          protocol: "ginko-content-cms/v1";
          result:
            | {
                breadcrumbs: Array<{
                  routable: boolean;
                  route: {
                    href?: string;
                    locale: string;
                    path: string;
                    slug: string;
                    source: "published";
                  };
                  title: string;
                }>;
                collection: string;
                locale: {
                  fallbacks: { fields: Array<{ from: string; path: string }> };
                  policy: "strict" | "transparent";
                  requested: string;
                  resolved: string;
                };
                page: {
                  assetFacts: Array<{
                    assetId: string;
                    bytes: number;
                    expiresAt: number | null;
                    fieldPath: string;
                    mediaType:
                      "image/png" | "image/jpeg" | "image/gif" | "image/webp";
                    sha256: string;
                    url: string;
                  }>;
                  bodyAst?: any;
                  bodyAstJson?: string;
                  collection: string;
                  data: Record<
                    string,
                    _GinkoCmsJsonDepth8
                  >;
                  id: string;
                  locale: {
                    fallbacks: {
                      fields: Array<{ from: string; path: string }>;
                    };
                    policy: "strict" | "transparent";
                    requested: string;
                    resolved: string;
                  };
                  publishedAt: string;
                  revision: string;
                  route: {
                    href?: string;
                    locale: string;
                    path: string;
                    slug: string;
                    source: "published";
                  };
                  stableId: string;
                  title: string;
                  toc?:
                    _GinkoCmsJsonDepth8;
                  translations: Array<{
                    locale: string;
                    route: {
                      href?: string;
                      locale: string;
                      path: string;
                      slug: string;
                      source: "published";
                    };
                    status: "published" | "missing";
                  }>;
                  updatedAt: string;
                };
                seo: {
                  alternates: Array<{
                    hreflang: string;
                    locale: string;
                    route: {
                      href?: string;
                      locale: string;
                      path: string;
                      slug: string;
                      source: "published";
                    };
                  }>;
                  canonical: string;
                  description: string;
                  title: string;
                  xDefault: {
                    href?: string;
                    locale: string;
                    path: string;
                    slug: string;
                    source: "published";
                  } | null;
                };
                status: "found";
              }
            | {
                breadcrumbs: Array<{
                  routable: boolean;
                  route: {
                    href?: string;
                    locale: string;
                    path: string;
                    slug: string;
                    source: "published";
                  };
                  title: string;
                }>;
                collection: string;
                locale: {
                  fallbacks: { fields: Array<{ from: string; path: string }> };
                  policy: "strict" | "transparent";
                  requested: string;
                  resolved: string;
                };
                page: null;
                redirectTo: {
                  href?: string;
                  locale: string;
                  path: string;
                  slug: string;
                  source: "published";
                };
                redirectedFrom: string;
                seo: null;
                status: "redirect";
              }
            | {
                breadcrumbs: Array<{
                  routable: boolean;
                  route: {
                    href?: string;
                    locale: string;
                    path: string;
                    slug: string;
                    source: "published";
                  };
                  title: string;
                }>;
                collection: string;
                locale: {
                  fallbacks: { fields: Array<{ from: string; path: string }> };
                  policy: "strict" | "transparent";
                  requested: string;
                  resolved: string;
                };
                page: null;
                seo: null;
                status: "not-found";
              };
        },
        Name
      >;
      routeMeta: FunctionReference<
        "query",
        "internal",
        {
          collection: string;
          fallback?: boolean | Array<string>;
          locale: string;
          path?: string;
          ref?: string;
        },
        | {
            breadcrumbs: Array<{
              routable: boolean;
              route: {
                href?: string;
                locale: string;
                path: string;
                slug: string;
                source: "published";
              };
              title: string;
            }>;
            collection: string;
            locale: {
              fallbacks: { fields: Array<{ from: string; path: string }> };
              policy: "strict" | "transparent";
              requested: string;
              resolved: string;
            };
            page: {
              assetFacts: Array<{
                assetId: string;
                bytes: number;
                expiresAt: number | null;
                fieldPath: string;
                mediaType:
                  "image/png" | "image/jpeg" | "image/gif" | "image/webp";
                sha256: string;
                url: string;
              }>;
              bodyAst?: any;
              bodyAstJson?: string;
              collection: string;
              data: Record<
                string,
                _GinkoCmsJsonDepth8
              >;
              id: string;
              locale: {
                fallbacks: { fields: Array<{ from: string; path: string }> };
                policy: "strict" | "transparent";
                requested: string;
                resolved: string;
              };
              publishedAt: string;
              revision: string;
              route: {
                href?: string;
                locale: string;
                path: string;
                slug: string;
                source: "published";
              };
              stableId: string;
              title: string;
              toc?:
                _GinkoCmsJsonDepth8;
              translations: Array<{
                locale: string;
                route: {
                  href?: string;
                  locale: string;
                  path: string;
                  slug: string;
                  source: "published";
                };
                status: "published" | "missing";
              }>;
              updatedAt: string;
            };
            seo: {
              alternates: Array<{
                hreflang: string;
                locale: string;
                route: {
                  href?: string;
                  locale: string;
                  path: string;
                  slug: string;
                  source: "published";
                };
              }>;
              canonical: string;
              description: string;
              title: string;
              xDefault: {
                href?: string;
                locale: string;
                path: string;
                slug: string;
                source: "published";
              } | null;
            };
            status: "found";
          }
        | {
            breadcrumbs: Array<{
              routable: boolean;
              route: {
                href?: string;
                locale: string;
                path: string;
                slug: string;
                source: "published";
              };
              title: string;
            }>;
            collection: string;
            locale: {
              fallbacks: { fields: Array<{ from: string; path: string }> };
              policy: "strict" | "transparent";
              requested: string;
              resolved: string;
            };
            page: null;
            redirectTo: {
              href?: string;
              locale: string;
              path: string;
              slug: string;
              source: "published";
            };
            redirectedFrom: string;
            seo: null;
            status: "redirect";
          }
        | {
            breadcrumbs: Array<{
              routable: boolean;
              route: {
                href?: string;
                locale: string;
                path: string;
                slug: string;
                source: "published";
              };
              title: string;
            }>;
            collection: string;
            locale: {
              fallbacks: { fields: Array<{ from: string; path: string }> };
              policy: "strict" | "transparent";
              requested: string;
              resolved: string;
            };
            page: null;
            seo: null;
            status: "not-found";
          },
        Name
      >;
      routes: FunctionReference<
        "query",
        "internal",
        {
          collection: string;
          cursor?: string | null;
          limit?: number;
          locale: string;
        },
        {
          protocol: "ginko-content-cms/v1";
          result: {
            pageInfo: { endCursor: string | null; hasNextPage: boolean };
            routes: Array<{
              collection: string;
              lastmod: string;
              locale: string;
              path: string;
              sitemapIncluded: boolean;
              stableId: string;
            }>;
            snapshot: string;
          };
        },
        Name
      >;
      search: FunctionReference<
        "query",
        "internal",
        {
          collection: string;
          cursor?: string | null;
          limit?: number;
          locale: string;
          query: string;
        },
        {
          protocol: "ginko-content-cms/v1";
          result: {
            locale: {
              fallbacks: { fields: Array<{ from: string; path: string }> };
              policy: "strict" | "transparent";
              requested: string;
              resolved: string;
            };
            pageInfo: { endCursor: string | null; hasNextPage: boolean };
            results: Array<{
              assetFacts: Array<{
                assetId: string;
                bytes: number;
                expiresAt: number | null;
                fieldPath: string;
                mediaType:
                  "image/png" | "image/jpeg" | "image/gif" | "image/webp";
                sha256: string;
                url: string;
              }>;
              bodyAst?: any;
              bodyAstJson?: string;
              collection: string;
              data: Record<
                string,
                _GinkoCmsJsonDepth8
              >;
              id: string;
              locale: {
                fallbacks: { fields: Array<{ from: string; path: string }> };
                policy: "strict" | "transparent";
                requested: string;
                resolved: string;
              };
              publishedAt: string;
              revision: string;
              route: {
                href?: string;
                locale: string;
                path: string;
                slug: string;
                source: "published";
              };
              stableId: string;
              title: string;
              toc?:
                _GinkoCmsJsonDepth8;
              translations: Array<{
                locale: string;
                route: {
                  href?: string;
                  locale: string;
                  path: string;
                  slug: string;
                  source: "published";
                };
                status: "published" | "missing";
              }>;
              updatedAt: string;
            }>;
          };
        },
        Name
      >;
      singleton: FunctionReference<
        "query",
        "internal",
        { locale?: string; name: string },
        {
          failure:
            | "missing_locale"
            | "unknown_collection"
            | "not_singleton"
            | "mode_mismatch"
            | "no_published_entry"
            | null;
          locale: {
            fallbacks: { fields: Array<{ from: string; path: string }> };
            policy: "strict" | "transparent";
            requested: string;
            resolved: string;
          };
          name: string;
          singleton: {
            assetFacts: Array<{
              assetId: string;
              bytes: number;
              expiresAt: number | null;
              fieldPath: string;
              mediaType:
                "image/png" | "image/jpeg" | "image/gif" | "image/webp";
              sha256: string;
              url: string;
            }>;
            bodyAst?: any;
            bodyAstJson?: string;
            collection: string;
            data: Record<
              string,
              _GinkoCmsJsonDepth8
            >;
            id: string;
            locale: {
              fallbacks: { fields: Array<{ from: string; path: string }> };
              policy: "strict" | "transparent";
              requested: string;
              resolved: string;
            };
            publishedAt: string;
            revision: string;
            route: {
              href?: string;
              locale: string;
              path: string;
              slug: string;
              source: "published";
            };
            stableId: string;
            title: string;
            toc?:
              _GinkoCmsJsonDepth8;
            translations: Array<{
              locale: string;
              route: {
                href?: string;
                locale: string;
                path: string;
                slug: string;
                source: "published";
              };
              status: "published" | "missing";
            }>;
            updatedAt: string;
          } | null;
        },
        Name
      >;
      siteData: FunctionReference<
        "query",
        "internal",
        { key: string; locale?: string },
        {
          protocol: "ginko-content-cms/v1";
          result: {
            data:
              | null
              | boolean
              | number
              | string
              | Array<
                  _GinkoCmsJsonDepth7
                >
              | Record<
                  string,
                  _GinkoCmsJsonDepth7
                >
              | null;
            key: string;
            locale: {
              fallbacks: { fields: Array<{ from: string; path: string }> };
              policy: "strict" | "transparent";
              requested: string;
              resolved: string;
            };
          };
        },
        Name
      >;
      sitemap: FunctionReference<
        "query",
        "internal",
        {
          collection: string;
          cursor?: string | null;
          limit?: number;
          locale: string;
        },
        {
          pageInfo: { endCursor: string | null; hasNextPage: boolean };
          urls: Array<{
            alternates: Array<{
              hreflang: string;
              locale: string;
              route: {
                href?: string;
                locale: string;
                path: string;
                slug: string;
                source: "published";
              };
            }>;
            collection: string;
            id: string;
            lastmod: string;
            route: {
              href?: string;
              locale: string;
              path: string;
              slug: string;
              source: "published";
            };
            xDefault: {
              href?: string;
              locale: string;
              path: string;
              slug: string;
              source: "published";
            } | null;
          }>;
        },
        Name
      >;
      surround: FunctionReference<
        "query",
        "internal",
        {
          collection: string;
          locale: string;
          next?: number;
          path: string;
          previous?: number;
        },
        {
          protocol: "ginko-content-cms/v1";
          result: {
            collection: string;
            locale: {
              fallbacks: { fields: Array<{ from: string; path: string }> };
              policy: "strict" | "transparent";
              requested: string;
              resolved: string;
            };
            next: Array<{
              assetFacts: Array<{
                assetId: string;
                bytes: number;
                expiresAt: number | null;
                fieldPath: string;
                mediaType:
                  "image/png" | "image/jpeg" | "image/gif" | "image/webp";
                sha256: string;
                url: string;
              }>;
              bodyAst?: any;
              bodyAstJson?: string;
              collection: string;
              data: Record<
                string,
                _GinkoCmsJsonDepth8
              >;
              id: string;
              locale: {
                fallbacks: { fields: Array<{ from: string; path: string }> };
                policy: "strict" | "transparent";
                requested: string;
                resolved: string;
              };
              publishedAt: string;
              revision: string;
              route: {
                href?: string;
                locale: string;
                path: string;
                slug: string;
                source: "published";
              };
              stableId: string;
              title: string;
              toc?:
                _GinkoCmsJsonDepth8;
              translations: Array<{
                locale: string;
                route: {
                  href?: string;
                  locale: string;
                  path: string;
                  slug: string;
                  source: "published";
                };
                status: "published" | "missing";
              }>;
              updatedAt: string;
            }>;
            previous: Array<{
              assetFacts: Array<{
                assetId: string;
                bytes: number;
                expiresAt: number | null;
                fieldPath: string;
                mediaType:
                  "image/png" | "image/jpeg" | "image/gif" | "image/webp";
                sha256: string;
                url: string;
              }>;
              bodyAst?: any;
              bodyAstJson?: string;
              collection: string;
              data: Record<
                string,
                _GinkoCmsJsonDepth8
              >;
              id: string;
              locale: {
                fallbacks: { fields: Array<{ from: string; path: string }> };
                policy: "strict" | "transparent";
                requested: string;
                resolved: string;
              };
              publishedAt: string;
              revision: string;
              route: {
                href?: string;
                locale: string;
                path: string;
                slug: string;
                source: "published";
              };
              stableId: string;
              title: string;
              toc?:
                _GinkoCmsJsonDepth8;
              translations: Array<{
                locale: string;
                route: {
                  href?: string;
                  locale: string;
                  path: string;
                  slug: string;
                  source: "published";
                };
                status: "published" | "missing";
              }>;
              updatedAt: string;
            }>;
          };
        },
        Name
      >;
    };
    redirects: {
      listRedirects: FunctionReference<
        "query",
        "internal",
        {
          collection: string;
          locale: string;
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
          state: "active" | "retired";
        },
        {
          continueCursor: string | null;
          isDone: boolean;
          page: Array<{
            collection: string;
            createdAt: number;
            createdBy: string;
            fromPath: string;
            id: string;
            kind: "exact" | "prefix";
            locale: string;
            operationId: string;
            retiredAt: number | null;
            retiredBy: string | null;
            source: "manual" | "publish" | "import";
            state: "active" | "retired";
            statusCode: number;
            targetEntryId: string;
            targetPath: string | null;
            targetReachable: boolean;
            updatedAt: number;
          }>;
        },
        Name
      >;
      previewRetireRedirectOperation: FunctionReference<
        "mutation",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          redirectId: string;
        },
        {
          allowed: boolean;
          blockers: Array<{
            code: string;
            count?: number;
            details?: any;
            message: string;
            status?: "blocked" | "stale";
          }>;
          confirm: any;
          confirmation: { expiresAt: number; token: string } | null;
          details: any;
          effects: Array<{
            count?: number | null;
            countLabel?: string;
            kind: string;
            minimumCount?: number;
            summary: string;
          }>;
          summary: string;
          version: any;
          warnings: Array<{
            code: string;
            count?: number;
            details?: any;
            message: string;
            status?: "blocked" | "stale";
          }>;
        },
        Name
      >;
      retireRedirectOperationExecute: FunctionReference<
        "mutation",
        "internal",
        {
          _confirmationToken?: string;
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          redirectId: string;
        },
        | {
            status: "applied";
            value: {
              fromPath: string;
              redirectId: string;
              retiredAt: number;
              targetPath: string | null;
            };
          }
        | { code: string; details: any; message: string; status: "blocked" }
        | { code: string; details: any; message: string; status: "stale" },
        Name
      >;
    };
    revalidation: {
      diagnostics: {
        testRevalidationTarget: FunctionReference<
          "action",
          "internal",
          {
            _expectedContentHash?: string;
            _expectedPresentationHash?: string;
            _trustedCaller?:
              | { kind: "anonymous"; subject: "system:anonymous" }
              | {
                  email?: string;
                  emailVerified?: boolean;
                  kind: "user";
                  name?: string;
                  subject: string;
                  userId: string;
                }
              | {
                  clientId: string;
                  issuer: string;
                  kind: "mcp";
                  scopes: Array<string>;
                  subject: string;
                  userId: string;
                }
              | { deployId: string; kind: "deploy"; subject: string };
            targetId: string;
          },
          {
            code:
              | "REVALIDATION_TEST_PASSED"
              | "REVALIDATION_SECRET_MISSING"
              | "REVALIDATION_TEST_TIMEOUT"
              | "REVALIDATION_TEST_HTTP_ERROR"
              | "REVALIDATION_TEST_NETWORK_ERROR";
            durationMs: number;
            message: string;
            status: "passed" | "failed";
            statusCode: number | null;
          },
          Name
        >;
      };
      listRevalidationJobs: FunctionReference<
        "query",
        "internal",
        {
          limit?: number;
          status?: "pending" | "delivering" | "delivered" | "failed";
        },
        Array<{
          attempts: number;
          createdAt: number;
          deliveredAt: number | null;
          id: string;
          lastError: string | null;
          nextAttemptAt: number;
          paths: Array<string>;
          payload: Record<
            string,
            _GinkoCmsJsonDepth8
          >;
          status: "pending" | "delivering" | "delivered" | "failed";
          tags: Array<string>;
          updatedAt: number;
        }>,
        Name
      >;
      listRevalidationTargets: FunctionReference<
        "query",
        "internal",
        {},
        Array<{
          createdAt: number;
          enabled: boolean;
          endpoint: string;
          environment: "production" | "preview" | "development";
          id: string;
          name: string;
          secretEnv: string;
          updatedAt: number;
        }>,
        Name
      >;
      previewRetryRevalidationJobOperation: FunctionReference<
        "mutation",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          eventId: string;
        },
        {
          allowed: boolean;
          blockers: Array<{
            code: string;
            count?: number;
            details?: any;
            message: string;
            status?: "blocked" | "stale";
          }>;
          confirm: any;
          confirmation: { expiresAt: number; token: string } | null;
          details: any;
          effects: Array<{
            count?: number | null;
            countLabel?: string;
            kind: string;
            minimumCount?: number;
            summary: string;
          }>;
          summary: string;
          version: any;
          warnings: Array<{
            code: string;
            count?: number;
            details?: any;
            message: string;
            status?: "blocked" | "stale";
          }>;
        },
        Name
      >;
      retryRevalidationJobOperationExecute: FunctionReference<
        "mutation",
        "internal",
        {
          _confirmationToken?: string;
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          eventId: string;
        },
        | { status: "applied"; value: null }
        | { code: string; details: any; message: string; status: "blocked" }
        | { code: string; details: any; message: string; status: "stale" },
        Name
      >;
      testRevalidationTarget: FunctionReference<
        "action",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          _trustedCaller?:
            | { kind: "anonymous"; subject: "system:anonymous" }
            | {
                email?: string;
                emailVerified?: boolean;
                kind: "user";
                name?: string;
                subject: string;
                userId: string;
              }
            | {
                clientId: string;
                issuer: string;
                kind: "mcp";
                scopes: Array<string>;
                subject: string;
                userId: string;
              }
            | { deployId: string; kind: "deploy"; subject: string };
          targetId: string;
        },
        {
          code:
            | "REVALIDATION_TEST_PASSED"
            | "REVALIDATION_SECRET_MISSING"
            | "REVALIDATION_TEST_TIMEOUT"
            | "REVALIDATION_TEST_HTTP_ERROR"
            | "REVALIDATION_TEST_NETWORK_ERROR";
          durationMs: number;
          message: string;
          status: "passed" | "failed";
          statusCode: number | null;
        },
        Name
      >;
      upsertRevalidationTarget: FunctionReference<
        "mutation",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          enabled: boolean;
          endpoint: string;
          environment: "production" | "preview" | "development";
          name: string;
          secretEnv: string;
          targetId?: string;
        },
        string,
        Name
      >;
    };
    reviewRequests: {
      approveReview: FunctionReference<
        "mutation",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          _trustedCaller?:
            | { kind: "anonymous"; subject: "system:anonymous" }
            | {
                email?: string;
                emailVerified?: boolean;
                kind: "user";
                name?: string;
                subject: string;
                userId: string;
              }
            | {
                clientId: string;
                issuer: string;
                kind: "mcp";
                scopes: Array<string>;
                subject: string;
                userId: string;
              }
            | { deployId: string; kind: "deploy"; subject: string };
          expectedVersionHash?: string | null;
          reviewRequestId: string;
        },
        {
          _id: string;
          agentRunId: string | null;
          createdAt: number;
          entryId: string;
          expectedVersion: number;
          isStale: boolean;
          locales: Array<string>;
          message: string | null;
          operationId: "ginko-cms.publish-entry";
          preview: {
            affectedPublicUrls: Array<{
              afterHref: string | null;
              beforeHref: string | null;
              entryId: string;
              label: string;
              locale: string;
              scope: "current_entry" | "descendant";
            }>;
            blockingIssueCodes: Array<string>;
            changes: Array<{
              after: string | boolean | null;
              before: string | boolean | null;
              entryId?: string;
              kind: "route" | "redirect" | "sitemap" | "search" | "nav" | "seo";
              label: string;
              locale: string;
              scope?: "current_entry" | "descendant";
            }>;
            collection: string;
            computedAt: number;
            entryId: string;
            kind: "publish-review-preview";
            locales: Array<{
              blockingIssueCodes: Array<string>;
              changeKinds: Array<
                "route" | "redirect" | "sitemap" | "search" | "nav" | "seo"
              >;
              currentHref: string | null;
              locale: string;
              nextHref: string | null;
              routeImpact: {
                continueCursor: string | null;
                hasMore: boolean;
                impactHash: string;
                listed: number;
                routeGeneration: number;
                total: number | null;
              };
              status: "ready" | "blocked" | "no_changes" | "not_publishable";
              warningIssueCodes: Array<string>;
            }>;
            status: "ready" | "blocked" | "no_changes" | "not_publishable";
            warningIssueCodes: Array<string>;
          };
          requestSource: "human" | "agent";
          requestedBy: string;
          reviewFeedback: string | null;
          reviewSummary: {
            affectedPublicUrlCount: number;
            affectedPublicUrls: Array<{
              afterHref: string | null;
              beforeHref: string | null;
              entryId: string;
              label: string;
              locale: string;
              scope: "current_entry" | "descendant";
            }>;
            affectedPublicUrlsHasMore: boolean;
            blockerCount: number;
            blockingIssueCodes: Array<string>;
            changeCount: number;
            localeStatuses: Array<{
              currentHref: string | null;
              locale: string;
              nextHref: string | null;
              status: "ready" | "blocked" | "no_changes" | "not_publishable";
            }>;
            status: "ready" | "blocked" | "no_changes" | "not_publishable";
            warningCount: number;
            warningIssueCodes: Array<string>;
          };
          reviewedAt: number | null;
          reviewedBy: string | null;
          staleReason: string | null;
          status: "pending" | "approved" | "rejected";
          summary: string;
          title: string;
          updatedAt: number;
          versionHash: string | null;
        },
        Name
      >;
      getOwnReviewRequest: FunctionReference<
        "query",
        "internal",
        {
          _trustedCaller?:
            | { kind: "anonymous"; subject: "system:anonymous" }
            | {
                email?: string;
                emailVerified?: boolean;
                kind: "user";
                name?: string;
                subject: string;
                userId: string;
              }
            | {
                clientId: string;
                issuer: string;
                kind: "mcp";
                scopes: Array<string>;
                subject: string;
                userId: string;
              }
            | { deployId: string; kind: "deploy"; subject: string };
          reviewRequestId: string;
        },
        {
          _id: string;
          agentRunId: string | null;
          createdAt: number;
          entryId: string;
          expectedVersion: number;
          isStale: boolean;
          locales: Array<string>;
          message: string | null;
          operationId: "ginko-cms.publish-entry";
          preview: {
            affectedPublicUrls: Array<{
              afterHref: string | null;
              beforeHref: string | null;
              entryId: string;
              label: string;
              locale: string;
              scope: "current_entry" | "descendant";
            }>;
            blockingIssueCodes: Array<string>;
            changes: Array<{
              after: string | boolean | null;
              before: string | boolean | null;
              entryId?: string;
              kind: "route" | "redirect" | "sitemap" | "search" | "nav" | "seo";
              label: string;
              locale: string;
              scope?: "current_entry" | "descendant";
            }>;
            collection: string;
            computedAt: number;
            entryId: string;
            kind: "publish-review-preview";
            locales: Array<{
              blockingIssueCodes: Array<string>;
              changeKinds: Array<
                "route" | "redirect" | "sitemap" | "search" | "nav" | "seo"
              >;
              currentHref: string | null;
              locale: string;
              nextHref: string | null;
              routeImpact: {
                continueCursor: string | null;
                hasMore: boolean;
                impactHash: string;
                listed: number;
                routeGeneration: number;
                total: number | null;
              };
              status: "ready" | "blocked" | "no_changes" | "not_publishable";
              warningIssueCodes: Array<string>;
            }>;
            status: "ready" | "blocked" | "no_changes" | "not_publishable";
            warningIssueCodes: Array<string>;
          };
          requestSource: "human" | "agent";
          requestedBy: string;
          reviewFeedback: string | null;
          reviewSummary: {
            affectedPublicUrlCount: number;
            affectedPublicUrls: Array<{
              afterHref: string | null;
              beforeHref: string | null;
              entryId: string;
              label: string;
              locale: string;
              scope: "current_entry" | "descendant";
            }>;
            affectedPublicUrlsHasMore: boolean;
            blockerCount: number;
            blockingIssueCodes: Array<string>;
            changeCount: number;
            localeStatuses: Array<{
              currentHref: string | null;
              locale: string;
              nextHref: string | null;
              status: "ready" | "blocked" | "no_changes" | "not_publishable";
            }>;
            status: "ready" | "blocked" | "no_changes" | "not_publishable";
            warningCount: number;
            warningIssueCodes: Array<string>;
          };
          reviewedAt: number | null;
          reviewedBy: string | null;
          staleReason: string | null;
          status: "pending" | "approved" | "rejected";
          summary: string;
          title: string;
          updatedAt: number;
          versionHash: string | null;
        },
        Name
      >;
      listPendingReviews: FunctionReference<
        "query",
        "internal",
        { limit?: number },
        Array<{
          _id: string;
          agentRunId: string | null;
          createdAt: number;
          entryId: string;
          expectedVersion: number;
          isStale: boolean;
          locales: Array<string>;
          message: string | null;
          operationId: "ginko-cms.publish-entry";
          preview: {
            affectedPublicUrls: Array<{
              afterHref: string | null;
              beforeHref: string | null;
              entryId: string;
              label: string;
              locale: string;
              scope: "current_entry" | "descendant";
            }>;
            blockingIssueCodes: Array<string>;
            changes: Array<{
              after: string | boolean | null;
              before: string | boolean | null;
              entryId?: string;
              kind: "route" | "redirect" | "sitemap" | "search" | "nav" | "seo";
              label: string;
              locale: string;
              scope?: "current_entry" | "descendant";
            }>;
            collection: string;
            computedAt: number;
            entryId: string;
            kind: "publish-review-preview";
            locales: Array<{
              blockingIssueCodes: Array<string>;
              changeKinds: Array<
                "route" | "redirect" | "sitemap" | "search" | "nav" | "seo"
              >;
              currentHref: string | null;
              locale: string;
              nextHref: string | null;
              routeImpact: {
                continueCursor: string | null;
                hasMore: boolean;
                impactHash: string;
                listed: number;
                routeGeneration: number;
                total: number | null;
              };
              status: "ready" | "blocked" | "no_changes" | "not_publishable";
              warningIssueCodes: Array<string>;
            }>;
            status: "ready" | "blocked" | "no_changes" | "not_publishable";
            warningIssueCodes: Array<string>;
          };
          requestSource: "human" | "agent";
          requestedBy: string;
          reviewFeedback: string | null;
          reviewSummary: {
            affectedPublicUrlCount: number;
            affectedPublicUrls: Array<{
              afterHref: string | null;
              beforeHref: string | null;
              entryId: string;
              label: string;
              locale: string;
              scope: "current_entry" | "descendant";
            }>;
            affectedPublicUrlsHasMore: boolean;
            blockerCount: number;
            blockingIssueCodes: Array<string>;
            changeCount: number;
            localeStatuses: Array<{
              currentHref: string | null;
              locale: string;
              nextHref: string | null;
              status: "ready" | "blocked" | "no_changes" | "not_publishable";
            }>;
            status: "ready" | "blocked" | "no_changes" | "not_publishable";
            warningCount: number;
            warningIssueCodes: Array<string>;
          };
          reviewedAt: number | null;
          reviewedBy: string | null;
          staleReason: string | null;
          status: "pending" | "approved" | "rejected";
          summary: string;
          title: string;
          updatedAt: number;
          versionHash: string | null;
        }>,
        Name
      >;
      listRecentReviewOutcomes: FunctionReference<
        "query",
        "internal",
        { limit?: number },
        Array<{
          _id: string;
          createdAt: number;
          entryId: string;
          expectedVersion: number;
          locales: Array<string>;
          reviewFeedback: string | null;
          reviewedAt: number | null;
          reviewedBy: string | null;
          reviewedByLabel: string | null;
          status: "approved" | "rejected";
          title: string;
        }>,
        Name
      >;
      listRecentReviewOutcomesForEntry: FunctionReference<
        "query",
        "internal",
        { entryId: string; limit?: number },
        Array<{
          _id: string;
          createdAt: number;
          entryId: string;
          expectedVersion: number;
          locales: Array<string>;
          reviewFeedback: string | null;
          reviewedAt: number | null;
          reviewedBy: string | null;
          reviewedByLabel: string | null;
          status: "approved" | "rejected";
          title: string;
        }>,
        Name
      >;
      rejectReview: FunctionReference<
        "mutation",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          _trustedCaller?:
            | { kind: "anonymous"; subject: "system:anonymous" }
            | {
                email?: string;
                emailVerified?: boolean;
                kind: "user";
                name?: string;
                subject: string;
                userId: string;
              }
            | {
                clientId: string;
                issuer: string;
                kind: "mcp";
                scopes: Array<string>;
                subject: string;
                userId: string;
              }
            | { deployId: string; kind: "deploy"; subject: string };
          feedback?: string;
          reviewRequestId: string;
        },
        {
          _id: string;
          agentRunId: string | null;
          createdAt: number;
          entryId: string;
          expectedVersion: number;
          isStale: boolean;
          locales: Array<string>;
          message: string | null;
          operationId: "ginko-cms.publish-entry";
          preview: {
            affectedPublicUrls: Array<{
              afterHref: string | null;
              beforeHref: string | null;
              entryId: string;
              label: string;
              locale: string;
              scope: "current_entry" | "descendant";
            }>;
            blockingIssueCodes: Array<string>;
            changes: Array<{
              after: string | boolean | null;
              before: string | boolean | null;
              entryId?: string;
              kind: "route" | "redirect" | "sitemap" | "search" | "nav" | "seo";
              label: string;
              locale: string;
              scope?: "current_entry" | "descendant";
            }>;
            collection: string;
            computedAt: number;
            entryId: string;
            kind: "publish-review-preview";
            locales: Array<{
              blockingIssueCodes: Array<string>;
              changeKinds: Array<
                "route" | "redirect" | "sitemap" | "search" | "nav" | "seo"
              >;
              currentHref: string | null;
              locale: string;
              nextHref: string | null;
              routeImpact: {
                continueCursor: string | null;
                hasMore: boolean;
                impactHash: string;
                listed: number;
                routeGeneration: number;
                total: number | null;
              };
              status: "ready" | "blocked" | "no_changes" | "not_publishable";
              warningIssueCodes: Array<string>;
            }>;
            status: "ready" | "blocked" | "no_changes" | "not_publishable";
            warningIssueCodes: Array<string>;
          };
          requestSource: "human" | "agent";
          requestedBy: string;
          reviewFeedback: string | null;
          reviewSummary: {
            affectedPublicUrlCount: number;
            affectedPublicUrls: Array<{
              afterHref: string | null;
              beforeHref: string | null;
              entryId: string;
              label: string;
              locale: string;
              scope: "current_entry" | "descendant";
            }>;
            affectedPublicUrlsHasMore: boolean;
            blockerCount: number;
            blockingIssueCodes: Array<string>;
            changeCount: number;
            localeStatuses: Array<{
              currentHref: string | null;
              locale: string;
              nextHref: string | null;
              status: "ready" | "blocked" | "no_changes" | "not_publishable";
            }>;
            status: "ready" | "blocked" | "no_changes" | "not_publishable";
            warningCount: number;
            warningIssueCodes: Array<string>;
          };
          reviewedAt: number | null;
          reviewedBy: string | null;
          staleReason: string | null;
          status: "pending" | "approved" | "rejected";
          summary: string;
          title: string;
          updatedAt: number;
          versionHash: string | null;
        },
        Name
      >;
      requestPublishReview: FunctionReference<
        "mutation",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          _trustedCaller?:
            | { kind: "anonymous"; subject: "system:anonymous" }
            | {
                email?: string;
                emailVerified?: boolean;
                kind: "user";
                name?: string;
                subject: string;
                userId: string;
              }
            | {
                clientId: string;
                issuer: string;
                kind: "mcp";
                scopes: Array<string>;
                subject: string;
                userId: string;
              }
            | { deployId: string; kind: "deploy"; subject: string };
          agentRunId?: string | null;
          entryId: string;
          expectedVersion: number;
          locales: Array<string>;
          message?: string | null;
          operationKey?: string;
          summary: string;
          title: string;
        },
        {
          _id: string;
          agentRunId: string | null;
          createdAt: number;
          entryId: string;
          expectedVersion: number;
          isStale: boolean;
          locales: Array<string>;
          message: string | null;
          operationId: "ginko-cms.publish-entry";
          preview: {
            affectedPublicUrls: Array<{
              afterHref: string | null;
              beforeHref: string | null;
              entryId: string;
              label: string;
              locale: string;
              scope: "current_entry" | "descendant";
            }>;
            blockingIssueCodes: Array<string>;
            changes: Array<{
              after: string | boolean | null;
              before: string | boolean | null;
              entryId?: string;
              kind: "route" | "redirect" | "sitemap" | "search" | "nav" | "seo";
              label: string;
              locale: string;
              scope?: "current_entry" | "descendant";
            }>;
            collection: string;
            computedAt: number;
            entryId: string;
            kind: "publish-review-preview";
            locales: Array<{
              blockingIssueCodes: Array<string>;
              changeKinds: Array<
                "route" | "redirect" | "sitemap" | "search" | "nav" | "seo"
              >;
              currentHref: string | null;
              locale: string;
              nextHref: string | null;
              routeImpact: {
                continueCursor: string | null;
                hasMore: boolean;
                impactHash: string;
                listed: number;
                routeGeneration: number;
                total: number | null;
              };
              status: "ready" | "blocked" | "no_changes" | "not_publishable";
              warningIssueCodes: Array<string>;
            }>;
            status: "ready" | "blocked" | "no_changes" | "not_publishable";
            warningIssueCodes: Array<string>;
          };
          requestSource: "human" | "agent";
          requestedBy: string;
          reviewFeedback: string | null;
          reviewSummary: {
            affectedPublicUrlCount: number;
            affectedPublicUrls: Array<{
              afterHref: string | null;
              beforeHref: string | null;
              entryId: string;
              label: string;
              locale: string;
              scope: "current_entry" | "descendant";
            }>;
            affectedPublicUrlsHasMore: boolean;
            blockerCount: number;
            blockingIssueCodes: Array<string>;
            changeCount: number;
            localeStatuses: Array<{
              currentHref: string | null;
              locale: string;
              nextHref: string | null;
              status: "ready" | "blocked" | "no_changes" | "not_publishable";
            }>;
            status: "ready" | "blocked" | "no_changes" | "not_publishable";
            warningCount: number;
            warningIssueCodes: Array<string>;
          };
          reviewedAt: number | null;
          reviewedBy: string | null;
          staleReason: string | null;
          status: "pending" | "approved" | "rejected";
          summary: string;
          title: string;
          updatedAt: number;
          versionHash: string | null;
        },
        Name
      >;
    };
    settings: {
      getStudioSettings: FunctionReference<
        "query",
        "internal",
        {},
        {
          installedContentHash: string;
          installedPresentationHash: string;
          locales: Array<{
            code: string;
            fallback?: string;
            isDefault?: boolean;
            label?: string;
          }>;
          transitionRunId: string | null;
          transitionState: "ready" | "locked";
          updatedAt: number;
          updatedBy: string | null;
        } | null,
        Name
      >;
    };
    siteData: {
      createSiteDataBlock: FunctionReference<
        "mutation",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          _trustedCaller?:
            | { kind: "anonymous"; subject: "system:anonymous" }
            | {
                email?: string;
                emailVerified?: boolean;
                kind: "user";
                name?: string;
                subject: string;
                userId: string;
              }
            | {
                clientId: string;
                issuer: string;
                kind: "mcp";
                scopes: Array<string>;
                subject: string;
                userId: string;
              }
            | { deployId: string; kind: "deploy"; subject: string };
          data?:
            _GinkoCmsJsonDepth8;
          key: string;
          label?: string | Record<string, string>;
          locale?: string;
          localized?: boolean;
          schemaType?: string;
          visibility?: "private" | "public";
        },
        string,
        Name
      >;
      deleteSiteDataBlockOperationExecute: FunctionReference<
        "mutation",
        "internal",
        {
          _confirmationToken?: string;
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          _trustedCaller?:
            | { kind: "anonymous"; subject: "system:anonymous" }
            | {
                email?: string;
                emailVerified?: boolean;
                kind: "user";
                name?: string;
                subject: string;
                userId: string;
              }
            | {
                clientId: string;
                issuer: string;
                kind: "mcp";
                scopes: Array<string>;
                subject: string;
                userId: string;
              }
            | { deployId: string; kind: "deploy"; subject: string };
          key: string;
        },
        | { status: "applied"; value: null }
        | { code: string; details: any; message: string; status: "blocked" }
        | { code: string; details: any; message: string; status: "stale" },
        Name
      >;
      getSiteDataBlock: FunctionReference<
        "query",
        "internal",
        { key: string },
        {
          _id: string;
          data:
            _GinkoCmsJsonDepth8;
          key: string;
          label: string | Record<string, string> | null;
          localized: boolean;
          schemaType: string | null;
          updatedAt: number;
          updatedBy: string | null;
          visibility: "private" | "public";
        } | null,
        Name
      >;
      listSiteData: FunctionReference<
        "query",
        "internal",
        {},
        Array<{
          _id: string;
          key: string;
          label: string | Record<string, string> | null;
          localized: boolean;
          schemaType: string | null;
          updatedAt: number;
          updatedBy: string | null;
          visibility: "private" | "public";
        }>,
        Name
      >;
      previewDeleteSiteDataBlockOperation: FunctionReference<
        "mutation",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          _trustedCaller?:
            | { kind: "anonymous"; subject: "system:anonymous" }
            | {
                email?: string;
                emailVerified?: boolean;
                kind: "user";
                name?: string;
                subject: string;
                userId: string;
              }
            | {
                clientId: string;
                issuer: string;
                kind: "mcp";
                scopes: Array<string>;
                subject: string;
                userId: string;
              }
            | { deployId: string; kind: "deploy"; subject: string };
          key: string;
        },
        {
          allowed: boolean;
          blockers: Array<{
            code: string;
            count?: number;
            details?: any;
            message: string;
            status?: "blocked" | "stale";
          }>;
          confirm: any;
          confirmation: { expiresAt: number; token: string } | null;
          details: any;
          effects: Array<{
            count?: number | null;
            countLabel?: string;
            kind: string;
            minimumCount?: number;
            summary: string;
          }>;
          summary: string;
          version: any;
          warnings: Array<{
            code: string;
            count?: number;
            details?: any;
            message: string;
            status?: "blocked" | "stale";
          }>;
        },
        Name
      >;
      saveSiteData: FunctionReference<
        "mutation",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          _trustedCaller?:
            | { kind: "anonymous"; subject: "system:anonymous" }
            | {
                email?: string;
                emailVerified?: boolean;
                kind: "user";
                name?: string;
                subject: string;
                userId: string;
              }
            | {
                clientId: string;
                issuer: string;
                kind: "mcp";
                scopes: Array<string>;
                subject: string;
                userId: string;
              }
            | { deployId: string; kind: "deploy"; subject: string };
          data:
            _GinkoCmsJsonDepth8;
          key: string;
          locale?: string;
        },
        null,
        Name
      >;
      updateSiteDataBlock: FunctionReference<
        "mutation",
        "internal",
        {
          _expectedContentHash?: string;
          _expectedPresentationHash?: string;
          _trustedCaller?:
            | { kind: "anonymous"; subject: "system:anonymous" }
            | {
                email?: string;
                emailVerified?: boolean;
                kind: "user";
                name?: string;
                subject: string;
                userId: string;
              }
            | {
                clientId: string;
                issuer: string;
                kind: "mcp";
                scopes: Array<string>;
                subject: string;
                userId: string;
              }
            | { deployId: string; kind: "deploy"; subject: string };
          key: string;
          label?: string | Record<string, string>;
          localized?: boolean;
          schemaType?: string;
          visibility?: "private" | "public";
        },
        null,
        Name
      >;
    };
    storageMaintenance: {
      getStorageHealth: FunctionReference<
        "query",
        "internal",
        {},
        {
          bytes: { checked: number; missing: number };
          checkedAt: number;
          constraints: { countComplete: boolean; supportedAssets: number };
          issues: Array<{
            code:
              | "asset-limit-exceeded"
              | "missing-bytes"
              | "pending-uploads"
              | "cleanup-failures";
            count: number;
            message: string;
          }>;
          operations: {
            pendingUploads: number;
            terminalCleanupFailures: number;
          };
          status: "healthy" | "attention";
          usage: {
            quotaBytes: null;
            quotaSource: "provider-managed";
            trackedAssets: number;
            trackedBytes: number;
          };
        },
        Name
      >;
      runStorageDiagnostic: FunctionReference<
        "mutation",
        "internal",
        { _expectedContentHash?: string; _expectedPresentationHash?: string },
        {
          checkedAt: number;
          code:
            | "STORAGE_UPLOAD_READY"
            | "STORAGE_SETUP_MISSING"
            | "STORAGE_LIMIT_REACHED"
            | "STORAGE_TEMPORARILY_UNAVAILABLE";
          createdStorageObject: false;
          message: string;
          status:
            | "healthy"
            | "missing-setup"
            | "quota-or-limit"
            | "temporary-failure";
        },
        Name
      >;
    };
  };

// Finite JSON aliases factored by compact-component-api.mjs.
type _GinkoCmsJsonDepth0 = null | boolean | number | string;
type _GinkoCmsJsonDepth1 = _GinkoCmsJsonDepth0 | Array<_GinkoCmsJsonDepth0> | Record<string, _GinkoCmsJsonDepth0>;
type _GinkoCmsJsonDepth2 = _GinkoCmsJsonDepth0 | Array<_GinkoCmsJsonDepth1> | Record<string, _GinkoCmsJsonDepth1>;
type _GinkoCmsJsonDepth3 = _GinkoCmsJsonDepth0 | Array<_GinkoCmsJsonDepth2> | Record<string, _GinkoCmsJsonDepth2>;
type _GinkoCmsJsonDepth4 = _GinkoCmsJsonDepth0 | Array<_GinkoCmsJsonDepth3> | Record<string, _GinkoCmsJsonDepth3>;
type _GinkoCmsJsonDepth5 = _GinkoCmsJsonDepth0 | Array<_GinkoCmsJsonDepth4> | Record<string, _GinkoCmsJsonDepth4>;
type _GinkoCmsJsonDepth6 = _GinkoCmsJsonDepth0 | Array<_GinkoCmsJsonDepth5> | Record<string, _GinkoCmsJsonDepth5>;
type _GinkoCmsJsonDepth7 = _GinkoCmsJsonDepth0 | Array<_GinkoCmsJsonDepth6> | Record<string, _GinkoCmsJsonDepth6>;
type _GinkoCmsJsonDepth8 = _GinkoCmsJsonDepth0 | Array<_GinkoCmsJsonDepth7> | Record<string, _GinkoCmsJsonDepth7>;
