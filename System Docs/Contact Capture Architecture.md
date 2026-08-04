# Contact Capture Architecture

## Contact Capture Architecture

Contact capture uses two sequential paths with short-circuit logic:

1. Marker detection (primary) — scans Sage's response for [PHONE:],
   [EMAIL:], [NAME:] markers emitted per prompt instructions. Runs first.
   If a value is found, passes validation, and is written successfully,
   the fallback is skipped for that field.

2. Regex watcher (fallback) — scans the visitor's own message for
   phone numbers and emails. Only runs if the marker path found nothing
   or failed to write.

Design decisions:
- Sequential not parallel — eliminates format conflicts between paths
- Short-circuit — marker wins if it captures and writes a valid value
- Self-guarded writes — once a field is written, neither path overwrites it
- Validation before write — isPlausiblePhone/isPlausibleEmail reject
  malformed values, allowing the fallback to try
- persistVisitorEmail and persistVisitorPhone return boolean — true means
  a fresh write occurred and the fallback is skipped; false means already
  set or failed, fallback still runs but self-guards

---
