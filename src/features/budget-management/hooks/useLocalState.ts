"use client";

import { useCallback, useState } from "react";

/**
 * Thin wrapper around useState that accepts a functional updater overload,
 * matching React's own setState signature for use with complex local state.
 */
export function useLocalState<T>(
  initial: T | (() => T)
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState<T>(initial);
  const dispatch = useCallback<React.Dispatch<React.SetStateAction<T>>>(
    (action) => {
      setValue(action);
    },
    []
  );
  return [value, dispatch];
}
