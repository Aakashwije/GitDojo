"use client";

import { useState } from "react";

/**
 * How many times `value` has changed since the component mounted: 0 on the first render, so an
 * element keyed by it animates when the value changes, never on mount or an unrelated re-render.
 */
export function useChangeCount(value: unknown): number {
  const [seen, setSeen] = useState({ value, count: 0 });
  if (Object.is(seen.value, value)) return seen.count;
  // Adjusting state while rendering, as React recommends for values derived from props.
  const next = { value, count: seen.count + 1 };
  setSeen(next);
  return next.count;
}
