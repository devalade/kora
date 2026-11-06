// Server errors arrive as plain messages (lockout, bad credentials) or, for failed validation, as
// a JSON list of issues. Shows the first readable message either way.
export function errorMessage(caught: unknown, fallback: string) {
  if (!(caught instanceof Error)) return fallback;
  try {
    const issues: unknown = JSON.parse(caught.message);
    if (Array.isArray(issues) && typeof issues[0]?.message === 'string') return issues[0].message;
  } catch {
    // Not JSON: the message is already readable.
  }
  return caught.message || fallback;
}
