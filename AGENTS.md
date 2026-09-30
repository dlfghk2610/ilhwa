# Project architecture rules

- Keep internal-company and external-company performance management in the shared `PerformanceDatabase` component, branching presentation with the `external` prop so CRUD, imports, files, and participant parsing remain behaviorally consistent.
