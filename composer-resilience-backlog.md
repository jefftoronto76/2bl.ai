# Composer Resilience Backlog

## Known Issues

### Navigate-away warning — Safari
Priority: P3

The `beforeunload` dialog does not fire reliably on Safari. Chrome confirmed
working. Safari has inconsistent `beforeunload` support — requires a different
approach (likely `visibilitychange` + a Heirloom-specific "unsaved changes" UI
banner rather than the browser dialog). Not blocking current sprint.

### Phone number normalization
Priority: P2

Captured phone numbers are stored raw (e.g. 4165641232). Before passing
to Twilio or Clerk, normalize to E.164 format (+14165641232).
Normalization should happen at the point of use — Twilio SMS send,
Clerk account creation — not at capture time. Raw value preserved in
chat_sessions.phone.

### Marker flash on stream completion
Priority: P3

Markers ([NAME:], [EMAIL:], [PHONE:]) briefly appear in the visitor UI
before the client-side registry strips them. Fix: suppress marker text
during streaming rather than render then strip. Does not affect capture
or database writes — cosmetic only.
