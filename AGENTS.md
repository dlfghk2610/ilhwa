# Project architecture rules

- Keep internal-company and external-company performance management in the shared `PerformanceDatabase` component, branching presentation with the `external` prop so CRUD, imports, files, and participant parsing remain behaviorally consistent.
- Keep configurable technician-performance Excel/PDF generation in the shared performance report module so both formats use the same columns, row expansion, and A4 settings.
