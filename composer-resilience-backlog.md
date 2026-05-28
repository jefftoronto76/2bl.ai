# Composer Resilience Backlog

## Known Issues

### Navigate-away warning — Safari
Priority: P3

The `beforeunload` dialog does not fire reliably on Safari. Chrome confirmed
working. Safari has inconsistent `beforeunload` support — requires a different
approach (likely `visibilitychange` + a Heirloom-specific "unsaved changes" UI
banner rather than the browser dialog). Not blocking current sprint.
