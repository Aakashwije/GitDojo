// The errors feature's public API. Other features import only from here ("@/features/errors").

export { ErrorExplanation } from "./components/ErrorExplanation";
export { explainOutcome } from "./services/explain-outcome";
export { useExplanationStore } from "./state/use-explanation-store";
