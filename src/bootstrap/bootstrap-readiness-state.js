import {LifecycleController} from './lifecycle-controller.js';

/**
 * Backward-compatible name for the lifecycle readiness owner.
 * Kept to avoid churn in imports while maintaining one implementation.
 */
class BootstrapReadinessState extends LifecycleController {}

export {BootstrapReadinessState};
