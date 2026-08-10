/**
 * Fehlertext aus einem `catch`-Wert.
 *
 * `catch (err)` liefert `unknown` — das ist korrekt, denn geworfen werden kann
 * alles. Statt das per `any` wegzutypisieren, geht jede Fehleranzeige durch
 * diese Stelle.
 */
export function errorMessage(err: unknown, fallback = "Unbekannter Fehler"): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err) return err;
  return fallback;
}
