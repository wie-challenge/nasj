# NASJ documentation

Entry point for all NASJ documentation. Each subject has one authoritative document; this page
routes you to it rather than repeating it.

Start with the [root README](../README.md) to run the project. Come here to understand, extend,
operate or audit it.

## Start here

| Document | Use it for |
|---|---|
| [Project overview](00-project/overview.md) | What NASJ is, who uses it, what it does |
| [Current status](00-project/current-status.md) | Capability-by-capability status with evidence |
| [Scope and boundaries](00-project/scope-and-boundaries.md) | What is deliberately not built |
| [Known gaps](08-backlog-and-acceptance/known-gaps.md) | Outstanding work and external gates |
| [Terminology](00-project/terminology.md) | RFQ, batch, payable, millime, synthetic |
| [Repository map](00-project/repository-map.md) | The four repositories and their boundaries |

## Architecture

| Document | Use it for |
|---|---|
| [System overview](02-architecture/system-overview.md) | Components and request path |
| [Component diagram](02-architecture/component-diagram.md) | Visual structure |
| [Data flow](02-architecture/data-flow.md) | Command, read and event flows |
| [Authorization model](02-architecture/authorization-model.md) | Roles, permissions, tenant isolation |
| [Database architecture](02-architecture/database-architecture.md) | Models, immutability, constraints |
| [Transaction integrity](02-architecture/transaction-integrity.md) | Advisory locks, atomicity |
| [Event and outbox model](02-architecture/event-and-outbox-model.md) | Audit and worker events |
| [API architecture](02-architecture/api-architecture.md) | Routes, CSRF, projections |

## Engineering

| Document | Use it for |
|---|---|
| [Local development](03-engineering/local-development.md) | Reproducing the stack |
| [Database and migrations](03-engineering/database-and-migrations.md) | Migration policy and workflow |
| [Testing guide](09-verification-and-quality/testing-guide.md) | Test categories and commands |
| [Concurrency limitations](09-verification-and-quality/concurrency-limitations.md) | What cannot be proven here |

## Security and operations

| Document | Use it for |
|---|---|
| [Security overview](06-security-and-governance/security-overview.md) | Controls and residual risks |
| [Deployment](07-operations/deployment.md) | Release procedure |
| [Monitoring](07-operations/monitoring.md) | Health, logs, alerts |
| [Background jobs](07-operations/background-jobs.md) | Worker behaviour |
| [Operational runbooks](07-operations/operational-runbooks.md) | Backup, recovery, checks |

## Product and IoT

| Document | Use it for |
|---|---|
| [Workspace UI](01-product/workspace-ui.md) | Layout and navigation conventions |
| [Finance and settlement](01-product/finance-and-settlement.md) | Ledgers, payables and the simulated-settlement boundary |
| [Logistics and traceability](01-product/logistics-and-traceability.md) | Quantities, custody and shipment gates |
| [Public traceability](01-product/public-traceability.md) | The read-only `/trace/:token` provenance page |
| [UI verification](09-verification-and-quality/ui-verification.md) | What was checked |
| [Wearable overview](05-iot/wearable-overview.md) | The IoT simulator and its separation |

## Evidence and history

| Location | Contents |
|---|---|
| [Archive index](99-archive/README.md) | All historical audits and batch reports |
| [Competition package](competition/PHASE1_TECHNICAL_REPORT.md) | Frozen submission artefacts |
| [Engineering evidence](engineering/README.md) | Surviving raw logs and artefacts, by batch |

Historical records are point-in-time. A historical PASS does not mean the current commit passes.

## Documentation maintenance

| Document | Use it for |
|---|---|
| [Documentation map](documentation-maintenance/DOCUMENTATION_MAP.md) | The full tree and deviations |
| [Source of truth](documentation-maintenance/SOURCE_OF_TRUTH.md) | Which file is authoritative per topic |
| [Conventions](documentation-maintenance/CONVENTIONS.md) | Where new documents belong |
| [Evidence recovery status](documentation-maintenance/EVIDENCE_RECOVERY_STATUS.md) | The 31 October evidence loss |
| [Final restructuring report](documentation-maintenance/FINAL_DOCUMENTATION_RESTRUCTURING_REPORT.md) | What the restructuring changed, and section I correcting its own unfinished claims |
| [Link validation](documentation-maintenance/LINK_VALIDATION.md) | Current broken-link count and its four known exceptions |
| [Archive manifest](documentation-maintenance/ARCHIVE_MANIFEST.md) | What moved into `99-archive/` |
| [Duplicates and obsolete files](documentation-maintenance/DUPLICATE_AND_OBSOLETE_FILES.md) | What is duplicated and why it is retained |
| [Documentation gaps](documentation-maintenance/DOCUMENTATION_GAPS.md) | What is deliberately not documented |
| [Inventory](documentation-maintenance/INVENTORY.json) | Machine-readable file list with sizes, hashes and tracked status |
