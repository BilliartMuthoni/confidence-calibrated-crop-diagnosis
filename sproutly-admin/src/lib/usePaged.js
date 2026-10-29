import { useState } from 'react'

// One page of a list, 25 rows at a time. `resetKey` sums up the filters, search and sort:
// when it changes, the list starts again at page 1 instead of an empty later page.
export function usePaged(rows, resetKey, size = 25) {
  const [state, setState] = useState({ key: resetKey, page: 1 })
  const pages = Math.max(1, Math.ceil(rows.length / size))
  const page = Math.min(state.key === resetKey ? state.page : 1, pages)
  return {
    rows: rows.slice((page - 1) * size, page * size),
    page,
    pages,
    total: rows.length,
    size,
    go: (next) => setState({ key: resetKey, page: next }),
  }
}
