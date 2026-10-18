export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
export const SESSION_ENDED = 'sproutly:session-ended'

export class ApiError extends Error {
  constructor(status, detail) {
    super(typeof detail === 'string' ? detail : `Request failed (${status})`)
    this.status = status
    this.detail = detail
  }
}

export async function apiFetch(path, { token, headers, ...options } = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...(options.body && !(options.body instanceof FormData) && { 'Content-Type': 'application/json' }),
      ...(token && { Authorization: `Bearer ${token}` }),
      ...headers,
    },
  })

  // 204 No Content (and other empty answers) have no body to read.
  const body = await response.text()
  const data = body && response.headers.get('content-type')?.includes('application/json') ? JSON.parse(body) : null

  if (!response.ok) {
    // A signed-in request refused as signed out: the session ended (expired, or the account
    // was deactivated). AuthProvider listens for this and returns to the sign-in page.
    if (response.status === 401 && token) window.dispatchEvent(new Event(SESSION_ENDED))
    throw new ApiError(response.status, data?.detail)
  }
  return data
}
