/**
 * Keeping a booking's driver and vehicle in step with the fleet's pairing.
 *
 * The fleet pairs a driver to a vehicle in Vehicle Management — the standing
 * answer to "whose truck is this". Operations should not have to re-answer it on
 * every booking, so picking either half fills in the other, switching the picked
 * half moves the other with it, and clearing the picked half takes the other
 * away again.
 *
 * Two rules keep that from fighting the operator, and they are the whole reason
 * this is a state machine rather than two lines in an onChange:
 *
 *   `filled` records which field the SYSTEM filled, never what the operator
 *   chose. Only that field is ever moved or cleared underneath them. Pick a
 *   vehicle by hand and no later driver change will overwrite it — the pairing
 *   is a shortcut, not a rule about who may drive what.
 *
 *   A counterpart is filled only when it is `pickable` for this booking. The
 *   caller decides that from the filtered dropdown lists, so a driver has
 *   already cleared their calendar and the fleet return, and a vehicle its
 *   BLOWBAGETS check and its return to the yard. A paired vehicle due a re-check
 *   fills in nothing and leaves the field empty to be crewed by hand, rather
 *   than pre-filling something the Assign call would then refuse.
 *
 * Lives outside the view so the behaviour can be tested without rendering it.
 */

/** Which half, if either, the pairing filled in rather than the operator. */
export type PairFilled = 'driver' | 'truck' | null

export interface CrewSelection {
  driverId:  string
  truckId:   string
  filled:    PairFilled
}

/** '' for "nothing paired". Keeps callers from having to juggle null vs ''. */
type Lookup = (id: string) => string | null

/** The operator picked a driver. Returns the whole new selection. */
export function pickDriver(
  current:      CrewSelection,
  driverId:     string,
  pairedTruckOf: Lookup,
  truckPickable: (truckId: string) => boolean,
): CrewSelection {
  const truckWasAuto = current.filled === 'truck'

  // A vehicle the operator chose themselves is theirs to keep.
  if (current.truckId && !truckWasAuto) {
    return { driverId, truckId: current.truckId, filled: null }
  }

  const paired = driverId ? pairedTruckOf(driverId) : null
  if (paired && truckPickable(paired)) {
    return { driverId, truckId: paired, filled: 'truck' }
  }

  // No pairing, or the paired vehicle cannot take this booking. Either way the
  // previous driver's vehicle must not stay attached to a different driver.
  return { driverId, truckId: truckWasAuto ? '' : current.truckId, filled: null }
}

/** The operator picked a vehicle. The exact mirror of `pickDriver`. */
export function pickTruck(
  current:        CrewSelection,
  truckId:        string,
  pairedDriverOf: Lookup,
  driverPickable: (driverId: string) => boolean,
): CrewSelection {
  const driverWasAuto = current.filled === 'driver'

  if (current.driverId && !driverWasAuto) {
    return { driverId: current.driverId, truckId, filled: null }
  }

  const paired = truckId ? pairedDriverOf(truckId) : null
  if (paired && driverPickable(paired)) {
    return { driverId: paired, truckId, filled: 'driver' }
  }

  return { driverId: driverWasAuto ? '' : current.driverId, truckId, filled: null }
}
