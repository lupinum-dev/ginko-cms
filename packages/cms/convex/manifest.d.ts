import { type ComponentBridgeManifest } from '@lupinum/trellis-bridge/manifest';
export declare class GinkoCmsHostSetupValidationError extends Error {
    constructor(message: string);
}
export declare function renderConvexConfig(current: string | null): string;
export declare function renderAuthConfig(current: string | null): string;
export declare function renderSchema(current: string | null): string;
export declare const ginkoCmsBridgeManifest: ComponentBridgeManifest;
export default ginkoCmsBridgeManifest;
