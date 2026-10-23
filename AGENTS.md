# Project architecture rules
- Store bid participation classification separately from bid status and share classification controls and badges across bid management and the dashboard so moving status tabs preserves classification.

- Keep internal-company and external-company performance management in the shared `PerformanceDatabase` component, branching presentation with the `external` prop so CRUD, imports, files, and participant parsing remain behaviorally consistent.
- Keep configurable technician-performance Excel/PDF generation in the shared performance report module so both formats use the same columns, row expansion, and A4 settings.
- Render dashboard backgrounds in a viewport-sized canvas with clamped edge-pixel extension so pan and zoom never expose unfilled space; scope transparent surfaces to the dashboard and leave the sidebar opaque.
- Pass page-specific header controls through AppLayout's optional headerActions slot so dashboard settings remain scoped to that page.
- Store dashboard background images per account in private storage referenced from the user's profile (with per-device-type transforms), using localStorage only as a per-user cache, so backgrounds follow the account across devices and never leak between accounts.
- Parse participant-list PDFs through the shared participant PDF module (header-column detection with registered-technician fallback, Korean cMaps served from public/cmaps) so imports stay consistent and testable.
- Create admin test/temporary accounts only through the admin-temp-accounts edge function (service role, admin check) with expiry kept in the admin-only-writable temp_accounts table, so users can never extend their own access.
