/** What every form action returns, so forms can show a clear success or error message. Safe to import in the browser. */
export interface ActionState {
  ok?: boolean;
  error?: string;
  message?: string;
  /** Anything extra a form needs back (for example the id of a new record). */
  data?: Record<string, unknown>;
}
