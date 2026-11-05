# UI verification — 2026-10-20

Verified locally on branch `ui/minimal-shadcn-workspaces`, based on the E02 catalog implementation. These results describe the current UI changes; they do not replace historical E16 evidence or complete the pending physical-device checks.

| Check | Result |
| --- | --- |
| Frozen lockfile install using cached packages | Passed (`pnpm install --frozen-lockfile --offline`) |
| Biome lint | Passed, 191 files |
| TypeScript checks | Passed for contracts, API, API tests and web |
| Unit tests | 46 passed (41 API/domain/operations, 5 web) |
| Disposable PostgreSQL and SMTP integration | 61 scenarios passed, including encrypted backup/restore |
| Chromium browser tests | 20 passed, no failures, skips or flaky results |
| Browser axe checkpoints | 24 passed, zero reported violations |
| Local preview login at 360px and 1280px | Zero axe violations and no horizontal overflow |
| Dependency audit | No known vulnerabilities reported |
| Production build | Passed for contracts, API and Next.js web |

The browser suite ran the catalog-to-RFQ flow and the buyer → artisan → operator journey at mobile, tablet and desktop sizes, including consent/decisions, production, QA, shipment, delivery, simulated payments and reports. It also verified organization onboarding, invitations and scoped revocation, artisan capacity and delegation, MFA, recovery, profile/session changes and disabled forms without JavaScript.

New layout checks cover buyer-only work links, hidden operator/admin links, active navigation, compact request creation, keyboard account tabs and mobile drawer behavior (focus, Escape and closing after navigation). The four new axe checkpoints cover the entire workspace shell; existing catalog and commerce checkpoints cover their main content. Automated checks do not establish complete accessibility conformance.

Visual review covered the desktop workspace and catalog, mobile catalog and mobile navigation drawer. The existing local preview at `http://localhost:3000/auth/login` returned HTTP 200 and served the new theme. No real account credentials were used for the verification.

Raw logs, JSON reports and screenshots are ignored under `.local/ui-*`, `.local/e2e-report.json`, `.local/catalog-*.png` and `.local/commerce-*-operator.png`. CI is configured to retain UI screenshots along with existing browser evidence. This report records local results; hosted CI has not run for these unpushed UI changes.
