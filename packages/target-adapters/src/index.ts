/**
 * Phase J1 — TargetAdapter implementations.
 *
 * Production-system wiring is injected via `TargetTransport`. The
 * provided `InMemoryTransport` powers tests and the verification harness.
 */
export * from "./transport.js";
export * from "./cloud-transport.js";
export { BaseTargetAdapter } from "./base-target-adapter.js";
export {
  ConfigurableTargetAdapter,
  type ConfigurableTargetAdapterSpec,
} from "./configurable-target-adapter.js";
export { SitsTargetAdapter } from "./sits-target-adapter.js";
export { BannerTargetAdapter } from "./banner-target-adapter.js";
