import { eur } from "../lib/format";

/**
 * Raum-Wähler — „erst den Raum, dann den Inhalt".
 *
 * Die **Form** des Wählers folgt der Informationsdichte, nicht der Seite:
 * Dashboard und Statistik zeigen eine Kachelleiste, weil jede Kachel eine
 * Leitkennzahl tragen kann; die Kategorien-Seite bekommt eine schmale Leiste,
 * weil „4 Kategorien" keine Kachel rechtfertigt.
 *
 * Der aktive Raum steht in der **URL** (`?raum=<id>`), nicht im `localStorage`:
 * verworfen wurde persistierter Zustand, nicht die Weitergabe über die URL.
 */

export interface Room {
  /** `null` = der persönliche Raum. */
  id: number | null;
  name: string;
  color: string;
  /** Leitkennzahl der Kachel — negativ wird als „Bedarf" gelesen. */
  rest?: number;
}

/** Wandelt einen `?raum=`-Wert in einen Raum. Unbekanntes fällt auf „persönlich" zurück. */
export function parseRoom(param: string | null, sharedIds: number[]): number | null {
  if (!param) return null;
  const id = parseInt(param, 10);
  return sharedIds.includes(id) ? id : null;
}

export const roomKey = (id: number | null) => (id === null ? "personal" : String(id));

/**
 * Kachelleiste — für Dashboard und Statistik.
 *
 * Bewusst als **Reiterreihe** gestaltet, nicht als Kartenreihe: mit derselben
 * Sprache wie die Karten darunter (`bg-gray-900 border-gray-800 rounded-xl`) war
 * der Wähler von Inhalt nicht unterscheidbar, und der aktive Raum unterschied sich
 * nur um zwei Graustufen. Die aktive Kante trägt die **Kontofarbe** — dieselbe
 * Farbe, die im Inhalt darunter den Raum markiert.
 */
export function RoomTiles({
  rooms,
  active,
  onSelect,
}: {
  rooms: Room[];
  active: number | null;
  onSelect: (id: number | null) => void;
}) {
  // Bei nur einem Raum gibt es nichts zu umschalten.
  if (rooms.length <= 1) return null;

  return (
    <div className="flex gap-1 flex-wrap border-b border-gray-800" role="tablist">
      {rooms.map((room) => {
        const isActive = room.id === active;
        const needs = room.rest !== undefined && room.rest < 0;
        return (
          <button
            key={roomKey(room.id)}
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelect(room.id)}
            className={`text-left px-4 pt-2 pb-2.5 -mb-px border-b-2 transition-colors min-w-[8rem] ${
              isActive ? "" : "border-transparent hover:bg-gray-800/40"
            }`}
            style={isActive ? { borderBottomColor: room.color } : undefined}
          >
            <div className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full shrink-0 transition-opacity ${isActive ? "" : "opacity-40"}`}
                style={{ backgroundColor: room.color }}
              />
              <span className={`text-sm font-medium ${isActive ? "text-white" : "text-gray-400"}`}>
                {room.name}
              </span>
            </div>
            {room.rest !== undefined && (
              <p
                className={`text-sm mt-0.5 font-semibold tabular-nums ${
                  isActive ? (needs ? "text-amber-400" : "text-green-400") : "text-gray-500"
                }`}
              >
                {/* Ein negativer `rest` ist im Gemeinschaftsraum der Normalfall —
                    monatlich zu deckender Bedarf, kein Verlust. */}
                {needs ? `Bedarf ${eur(Math.abs(room.rest))}` : eur(room.rest)}
              </p>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Schmale Leiste — für Seiten, deren Inhalt keine Kachel füllt. */
export function RoomRail({
  rooms,
  active,
  onSelect,
}: {
  rooms: Room[];
  active: number | null;
  onSelect: (id: number | null) => void;
}) {
  if (rooms.length <= 1) return null;

  return (
    <nav className="shrink-0 w-44 space-y-1">
      {rooms.map((room) => {
        const isActive = room.id === active;
        return (
          <button
            key={roomKey(room.id)}
            onClick={() => onSelect(room.id)}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors ${
              isActive ? "bg-gray-800 text-white" : "text-gray-400 hover:bg-gray-800/50 hover:text-gray-200"
            }`}
          >
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: room.color }} />
            <span className="truncate">{room.name}</span>
          </button>
        );
      })}
    </nav>
  );
}
