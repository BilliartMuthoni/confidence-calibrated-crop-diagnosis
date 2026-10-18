import { useCallback, useEffect, useState } from 'react'

// Load data for a page: { data, error, loading, reload }. `load` must be stable (useCallback);
// a new `load` (e.g. a changed filter) or reload() fetches again. While refetching, the
// previous data stays on screen instead of flashing a loading message.
export function useLoad(load) {
  const [state, setState] = useState({ data: null, error: null, loading: true })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let current = true
    load()
      .then((data) => current && setState({ data, error: null, loading: false }))
      .catch((error) => current && setState({ data: null, error, loading: false }))
    return () => {
      current = false
    }
  }, [load, attempt])

  const reload = useCallback(() => setAttempt((n) => n + 1), [])
  return { ...state, reload }
}
