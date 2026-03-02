/**
 * @module @laila/domain/validation
 *
 * Business rule validation for domain operations.
 *
 * This module enforces domain-level business rules such as whether a task
 * can be assigned, whether a dependency relationship is valid, and whether
 * a state transition is permitted. These rules are distinct from schema
 * validation (handled by @laila/shared) -- they encode the business
 * invariants that must hold across orchestration operations.
 *
 * All functions are pure with no side effects -- validation results are
 * computed deterministically from the provided inputs.
 */

export {};
