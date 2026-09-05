/**
 * Display formatting shared across every screen.
 *
 * `money` lives here (not in the deleted mock fixtures) because component templates
 * call it directly — it is presentation logic, not sample data.
 */

/** Formats integer cents as a display price. All money in this app is integer cents. */
export function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
