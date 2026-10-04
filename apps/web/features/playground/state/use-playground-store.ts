import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface PlaygroundStore {
  /** The scenario the workspace was last built from; `null` for a blank new repository. */
  scenarioId: string | null;
  /** False until saved settings have been read from the browser. */
  hydrated: boolean;
  setScenario: (scenarioId: string | null) => void;
}

/**
 * Which scenario the playground repository came from, so Reset can rebuild it after a refresh.
 * The repository itself lives in IndexedDB (LightningFS); this only remembers its origin.
 */
export const usePlaygroundStore = create<PlaygroundStore>()(
  persist(
    (set) => ({
      scenarioId: null,
      hydrated: false,
      setScenario: (scenarioId) => {
        set({ scenarioId });
      },
    }),
    {
      name: "gitdojo:playground",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ scenarioId: state.scenarioId }),
      skipHydration: true,
    },
  ),
);

let hydration: Promise<void> | null = null;

/** Reads saved playground settings once; storage can be unavailable (private browsing). */
export function hydratePlaygroundStore(): Promise<void> {
  hydration ??= Promise.resolve(usePlaygroundStore.persist.rehydrate())
    .catch((error: unknown) => {
      console.warn("[gitdojo] could not restore playground settings", error);
    })
    .finally(() => {
      usePlaygroundStore.setState({ hydrated: true });
    });
  return hydration;
}
