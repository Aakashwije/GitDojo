import {
  type RepositoryState,
  type ValidatorDefinition,
  type ValidatorResult,
  type ValidatorType,
} from "@gitdojo/shared-types";

export interface ValidatorContext {
  repository: RepositoryState;
}

export type ValidatorHandler<T extends ValidatorDefinition> = (
  definition: T,
  context: ValidatorContext,
) => Promise<ValidatorResult>;

export type ValidatorOfType<K extends ValidatorType> = Extract<ValidatorDefinition, { type: K }>;

/** One handler per validator type; the compiler rejects a missing or mismatched handler. */
export type ValidatorRegistry = {
  [K in ValidatorType]: ValidatorHandler<ValidatorOfType<K>>;
};
