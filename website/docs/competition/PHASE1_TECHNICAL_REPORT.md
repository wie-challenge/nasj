# NASJ: a managed artisan production workflow

**Status: review candidate, not submitted or owner-approved.** Evidence cutoff: 27 October 2026. All business scenario data is synthetic. The organizer-linked two-page brief was retrieved and visually reviewed during Batch 7 [R9]. This source follows its required headings, abstract/keyword ranges and six-page maximum. Readable A4 typography is chosen because the brief supplies no font/margin template. Eligibility, independent originality review and owner sign-off remain open. PDF layout and actual video validation are recorded separately in ARTIFACT_VALIDATION.md; they do not prove submission readiness.

## Abstract

NASJ investigates a managed business-to-business approach to artisan production in Tunisia. The project hypothesis is that explicit product requirements, voluntary work decisions and attributable coordination can make commercial production easier to review. This hypothesis has not been validated through interviews, time studies or a paid field pilot. The implemented prototype connects buyer requests, versioned quotations, artisan eligibility and acceptance, production reporting, quality inspection, shipment custody and public traceability. Organization-scoped permissions separate buyer, internal operator, association and artisan activities. Material requirements are distinct from recorded inventory, and synthetic payment simulations are distinct from verified money movement. Quantities and Tunisian dinar amounts use exact arithmetic. An isolated showroom provides fictional persona accounts and scenario-specific navigation through real application services; reset retains immutable history by creating a new scenario generation. Evaluation uses automated unit, database and browser checks with controlled synthetic records. These checks demonstrate software behavior rather than economic impact, medical safety or operational readiness. The current implementation retains blockers for unsupported accountless acceptance, physical inventory verification, bank reconciliation, legal settlement and tax policy. A separate local wearable simulator remains outside commercial decision-making. The next validation step is an owner-reviewed discovery and feasibility programme, followed by deployment-specific security and recovery checks before any controlled real-world use.

**Keywords:** artisan production; managed B2B; scoped authorization; traceability; synthetic evaluation.

## Introduction

The selected concept explores a managed B2B production service for Tunisian artisan networks, with embroidery as the focused product hypothesis. Buyers would need explicit specifications, prices and delivery expectations. Artisans would need understandable work terms, a voluntary decision and a visible compensation record. Associations would assist only within authorized assignments. These needs are design assumptions to investigate, not findings attributed to interviews [R1, R2].

The project has no approved evidence for income uplift, active artisan counts, delivery reliability, partner endorsement or injury prevention. No such outcome is claimed. The team must validate the primary craft, buyer demand and association operating model with documented consent and methods before presenting them as field evidence [G1–G4].

## Related Work

NASJ coordinates a product-supply workflow rather than asking an artisan to accept an unseen commitment. Buyers create requests and accept a specific quoted version. Authorized operators assess available declared capacity, record costing assumptions and issue offers. The artisan independently accepts or declines their own offer. Association assistance records its actual author; an unapproved accountless acceptance report remains pending and creates no confirmed commitment [R3, R4].

This is a prototype design comparison, not a completed literature review. The existing system combines specification versions, controlled production records and explicit acceptance; external evidence of comparative benefit is still needed. The design contribution is the combination of exact terms, attributable custody, voluntary acceptance and separate evidence states across one reviewable workflow. This is an implemented design choice, not a claim of patent novelty or validated social impact. Alternatives and user benefit still require discovery evidence [G1–G3].

## Methodology / Materials and Methods

### Architecture and technology

The browser uses Next.js and React. A NestJS API owns authorization and business transactions. Better Auth provides real account sessions; Prisma connects the API to PostgreSQL. Shared TypeScript/Zod contracts validate inputs. Existing CSRF, origin, rate-limit, safe-error and privileged MFA controls remain in place. PostgreSQL constraints, transactions and append-only history protect operational and financial records [R3–R5].

The domains retain distinct source records: specifications describe requirements; accepted artisan offers create production batches; inspections approve quantities; preparations allocate approved pieces; shipments record custody; buyer confirmations record accepted, damaged and missing pieces. Public QR pages expose an approved coarse craft story, not private artisan contacts or financial terms. Financial recognition and simulation do not alter the fact of verified payment [R4, R5].

The isolated showroom uses isolated synthetic identities and visitor-owned scenario generations. It does not replace the commercial API with a frontend animation. A reset archives the old synthetic instance, revokes its authorized access and creates a clean instance; immutable obligations and custody events are retained. Showroom endpoints remain unavailable to normal production configurations [R6].

### Commercial and artisan workflow

The demonstration begins with labeled synthetic product requirements and commercial assumptions. Buyer acceptance binds the displayed quotation version. Eligibility precedes offer issuance; artisan acceptance precedes production. Production reports are cumulative. Quality inspection reconciles approved, rejected and pending pieces. Only quality-approved quantities enter shipment preparation. Collection, hub receipt, dispatch, operator delivery reporting and buyer acceptance remain separate events [R4].

Inventory uses exact quantities and separates available, reserved, issued, consumed, damaged and quarantined material. A short or damaged receipt blocks material readiness. Returns do not become available merely because they were recorded. Financial requests reference recognized payables, use independent maker/checker approval and retain execution reports as unverified. A synthetic settlement can never become a bank-verified transfer. Closure assessments expose unpaid or unresolved obligations and policy gaps [R5].

### Decision support and optional safety concept

Website feasibility, eligibility and costing use explainable rules and declared inputs. Capacity is not inferred from wearable data. The separate Python service is a deterministic advisory baseline, not trained machine learning; its README states that website integration is not implemented. No model accuracy, learned production-time estimate or deployment benefit is claimed [R7]. A future integration would need authorized minimized inputs, versioned recommendations, human review, artisan consent and suitable evaluation data.

The optional wearable concept is independent from the supply-chain track. The local simulator uses synthetic motion inputs and simulated reminder pulses. It does not certify a device, detect a medical condition or prove injury reduction. Its local data reset is a separate action; commerce neither uploads nor resets private monitoring history [R8].

### Evaluation method

The evaluation method uses controlled synthetic users and business records, real PostgreSQL transactions, actual HTTP services and browser interaction. Unit checks cover arithmetic and contracts. Integration checks cover scoped access, concurrency, replay, quantity limits, maker/checker behavior and unsupported verification. Browser checks cover successful workflow navigation and useful blocked states. Backup/restore and migration-preservation checks operate only on disposable databases [R5, R6].

Historical Batch 5 evidence records 70 API unit tests, 13 web unit tests, 110 database scenarios and 36 browser tests passing, with lint, typecheck and build passing. These counts describe the dated Batch 5 implementation, not an independent field measurement or a final Batch 6 result. Current Batch 7 results belong in its separate engineering evidence register after execution [R5, R6].

For repeatability, record fixture version, build identifiers, executed commands, observed failures and final outcomes. A negative test proving an accountless or financial blocker must be reported as evidence of the restriction, not completion of the blocked real-world process. Original acceptance criteria and unresolved owner decisions remain visible in the acceptance matrix [R6].

### Financial assumption comparison

The independent simulator supports unit compensation or hourly rate multiplied by effort minutes, rounded half up to the nearest millime per produced unit. Expected revenue is quantity times selling price times the modeled accepted fraction; variable labor, material, QA and packaging costs apply to every produced unit, including modeled rejects. Transport and overhead are fixed. Contingency applies to total modeled costs. Contribution is revenue minus costs; losses remain signed. Break-even is a ceiling of the disclosed continuous planning formula and is unavailable for nonpositive marginal contribution. No tax rule is guessed. This model does not modify accepted quotes or worker obligations.

A synthetic baseline of 100 pieces, 30.000 TND selling price, 12.000 unit compensation, 5.000 materials, 1.000 QA and 1.000 packaging, 200.000 fixed costs, five-percent rejection and five-percent contingency yields 2,850.000 expected revenue, 1,200.000 direct compensation and 645.000 planned contribution. This is arithmetic under invented assumptions, not profit or paid income. Producer share uses agreed direct compensation over modeled net revenue and remains a modeled ratio; actual public metrics retain privacy suppression and approved policy limits.

## Results and Discussion

### Software results, ethics and limitations

Artisan acceptance is voluntary and authenticated. Coordinator assistance never silently becomes artisan consent or waiver of compensation. Private profiles and financial details are resource-scoped. Public provenance references must be privacy-safe. A user-selected label does not establish external verification. Demonstrations distinguish PROPOSED, SYNTHETIC, MEASURED and VERIFIED claims while preserving actual domain statuses [R6].

The implementation has no verified buyer bank receipts, verified artisan transfers, approved stock verification process, tax/invoice policy or lawful cancellation entitlement process. No research interviews, signed partnerships, real production time studies or device certification are evidenced here. The brief explicitly requires anonymity for the video; owner review must also decide appropriate report identity treatment: application branding, filenames, account names, institution cues, narration and document metadata can identify a team [G1–G8].

## Conclusion and Future Work

The website demonstrates a connected synthetic commercial workflow with explicit blocking conditions. The showroom provides repeatable entry, real persona navigation, evidence labels and visitor-scoped scenario recreation. Batch 7 adds an interactive presentation with keyboard/full-screen/resume controls and a pure financial assumption comparator. Simulator changes do not write quotations, orders or ledgers. Modeled negative contribution remains visible, and undefined denominators remain unavailable. Default values are synthetic assumptions, not measured prices or verified worker income. It does not establish readiness for real orders or payments. Owner acceptance, current organizer requirements, source research, deployment-specific backup/recovery, privacy/legal review and independent operational evidence remain prerequisites [R6].

The next research tasks are buyer and artisan interviews, an ethically collected embroidery time study and reviewed association procedures. Engineering work should then test those approved operating rules in staging. A controlled pilot requires explicit authorization and evidence beyond a successful software demonstration.

## References

[R1] Original issue #199: https://github.com/wie-challenge/website/issues/199 — recorded report requirements; not a substitute for official organizer instructions.

[R2] Final full project backlog v2.0, sibling `../docs/HirfaCare_FINAL_Full_Project_Backlog.md`, discovery and legal gate sections; live issue snapshot `../engineering/evidence/batch6-20261027/github-issues.json`.

[R3] Website source `apps/api/src/modules/auth/`, `modules/foundation/`, `security/`, shared contracts and Prisma schema. Implementation source, not a third-party certification.

[R4] Website reports `../engineering/COMMERCIAL_DECISION_2026-10-27.md`, `PRODUCTION_OFFERS_2026-10-27.md`, `PRODUCTION_EXECUTION_2026-10-27.md` and `LOGISTICS_TRACEABILITY_2026-10-27.md`.

[R5] `../engineering/BATCH5_IMPLEMENTATION_2026-10-27.md` and dated raw test logs under `../engineering/evidence/batch5-20261027/`.

[R6] `../engineering/BATCH6_IMPLEMENTATION.md`, `BATCH6_ACCEPTANCE_MATRIX.md`, `EVIDENCE_PROVENANCE_POLICY.md`, `MIGRATION_READINESS.md` and ../engineering/BATCH7_IMPLEMENTATION.md with its dated raw evidence. Interpret final statuses only after those results are recorded.

[R7] Optional sibling `ai-backend/README.md`, inspected 27 October 2026: deterministic baseline; no integrated website deployment or trained-model outcome claimed.

[R8] Optional sibling `iot/simulator/README.md`, inspected 27 October 2026: local synthetic simulator; physical device evidence blocked.

[R9] TSYP14 organizer challenge specification, pp1-2, retrieved 27 October 2026: https://drive.google.com/file/d/1CE_09tClW84i7t-oh6olvyofaJQwmkJH/view . Discovery index: https://tsyp.ieee.tn/program/challenges/ . Source hash and requirements are retained in ELIGIBILITY_AND_TRACK_REGISTER.md.

## Tracked evidence requirements

G1: owner-approved artisan interviews and consent; G2: buyer discovery and demand evidence; G3: primary craft selection/time study/compensation baseline; G4: association agreement and operating method; G5: remaining organizer clarifications (portal, time zone, file limits, video tolerance); G6: final PDF page/readability/identity audit; G7: rendered video duration/audio/identity audit; G8: team eligibility, submission access, independent originality/AI-assistance review and owner sign-off. Roster evidence collection was skipped at owner request. None is inferred from software test counts.
