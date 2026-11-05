# Minimal workspace UI

The workspace uses a neutral shadcn/ui theme with a teal accent, a desktop sidebar and a mobile navigation drawer. Work links follow the signed-in user's buyer, artisan and operator capabilities; administration appears only for administrators. API authorization remains authoritative.

Buyer requests, artisan production and operator review retain their existing commands. Request creation, planning assumptions, simulated payment records and notifications use expandable sections. Counts describe records returned in the current workspace, rather than organization-wide totals. The catalog keeps example and lead-time disclosures and the existing RFQ prefill flow.

Account settings use keyboard-accessible tabs for personal details, password and sessions, and account access. Existing authentication, CSRF handling, validation and session behavior remain in place. Demo payments and example catalog content remain explicitly labelled.

## Components and styling

Components in `apps/web/src/components/ui` are adapted from the official [shadcn/ui new-york-v4 registry](https://ui.shadcn.com/r/styles/new-york-v4/button.json). The upstream [MIT license](../../apps/web/src/components/ui/LICENSE) is included. Local changes give buttons an explicit keyboard outline, improve tab-label contrast and enlarge the sheet close control.

`apps/web/components.json` records the registry configuration. Tailwind CSS v4 runs through PostCSS; CSS variables in `apps/web/src/app/globals.css` define colors, spacing and radii. The stylesheet also maintains shared styles for existing organization, artisan and authentication screens. Dependencies are pinned in the workspace lockfile. Add components under `src/components/ui`, preserve the license and check keyboard behavior and contrast when adapting their styles.

## Verification

Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm test:e2e`, `pnpm audit --audit-level=high` and `pnpm build` from the website repository.

Browser tests use disposable PostgreSQL data and synthetic identities. `tests/e2e/workspace-ui.spec.ts` checks capability-based navigation, active links, the request composer, keyboard account tabs and the mobile drawer's focus, Escape and navigation behavior at 360px. It also checks page overflow and runs axe on the full desktop workspace, mobile account, open drawer and mobile catalog. Existing catalog and commerce tests cover the buyer-to-artisan-to-operator journey with QA, shipment, simulated payment and reports.

Screenshots are written to ignored `.local/ui-*.png`, `.local/catalog-*.png` and `.local/commerce-*-operator.png`; structured browser results are in `.local/e2e-report.json`. CI collects these as short-lived verification artifacts. No real user credentials are included.

See [the latest local verification results](../09-verification-and-quality/ui-verification.md) for counts and scope.
