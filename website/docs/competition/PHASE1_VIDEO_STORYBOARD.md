# Phase 1 progress video — storyboard and narration

Status: **Rendered review candidate; not submitted or owner-approved.** Target: 180 seconds. The organizer-linked brief confirms a three-minute anonymous technical/progress video with minimal editing preferred. Exact timing tolerance and upload/container limits remain unspecified. The rendered candidate is a minimally cut montage of actual disposable-showroom browser screenshots, local synthetic narration and burned captions; it is not a continuous screen recording or a final anonymity approval. Actual duration, hashes and media checks are recorded in ARTIFACT_VALIDATION.md.

Use synthetic showroom records only. Keep the SYNTHETIC warning visible throughout footage. Do not record credentials, browser account menus, emails, private path names, institution/branch logos or real people. Hide IDE, terminal and operating-system identity cues. Retake a screen recording if a private record appears; blurring after capture is not a substitute for selecting a synthetic source.

## Scene 1 — Problem hypothesis (0:00–0:20; 20 seconds)

Screen: the concept landing page's problem and evidence labels. Use the public product name only if the organizer's anonymity rules allow product branding. Neutral scene title: “A managed artisan-production workflow.”

Narration: “We are investigating a managed production workflow for artisan networks in Tunisia. The starting hypothesis is that buyers need clear product terms and coordinated delivery, while artisans need understandable offers and voluntary participation. We have not yet validated this hypothesis through field interviews or a paid pilot.”

Evidence: PROPOSED research hypothesis, not an observed market outcome. No unsupported market-size or income numbers.

## Scene 2 — Approach and architecture (0:20–0:45; 25 seconds)

Screen: public presentation methodology followed by showroom stages. Use a neutral diagram only if it matches the implemented Next.js, NestJS, Better Auth and PostgreSQL boundaries. Do not display private infrastructure endpoints.

Narration: “The prototype connects buyers, internal operators, associations and artisans. A web interface calls an authenticated business API. PostgreSQL transactions, exact quantities and recorded history support traceable decisions. The showroom uses separate fictional accounts with real permissions. Choosing a persona does not grant unrestricted access.”

Evidence: implemented software architecture; synthetic participant data. Do not imply that displayed business records came from a real association.

## Scene 3 — Commercial terms and artisan decision (0:45–1:15; 30 seconds)

Screen: choose buyer, review quotation version and accept; switch to production, review capacity and issue an offer; switch to artisan, review work/compensation and accept. Use footage from the same scenario generation. Cut idle loading time without changing event order.

Narration: “In one synthetic scenario, a buyer reviews a versioned quotation. The operator checks declared capacity and prepares a specific offer. The artisan sees the work, compensation and conditions, then decides independently. A coordinator's report for an accountless artisan remains pending because no approved acceptance method exists. It creates no confirmed commitment.”

Evidence: actual API transitions; accountless blocker must remain visible. Do not claim seeded commercial assumptions were produced by a trained AI model.

## Scene 4 — Production, quality and custody (1:15–1:45; 30 seconds)

Screen: release with synthetic labels; artisan progress and submission; QA approval with rejected/pending quantities visible; approved preparation; coordinator pickup followed by operator hub receipt and dispatch.

Narration: “The production batch follows recorded material requirements. Progress is cumulative, and inspection separates approved, rejected and pending pieces. Only approved pieces can enter shipment preparation. Collection, hub receipt and dispatch are distinct custody events. These examples exercise the software; they do not certify physical stock, production quality or carrier delivery.”

Evidence: synthetic materials and inspection records, actual workflow restrictions. Record real error/blocked screens separately if the main take exceeds timing.

## Scene 5 — Buyer receipt, QR and finance (1:45–2:15; 30 seconds)

Screen: buyer receipt confirmation; public QR page, privacy-suppressed producer metric if applicable; finance payable, independent approval and simulation/pending verification.

Narration: “Buyer confirmation records accepted, damaged and missing pieces separately. The public craft page exposes an approved story and limited provenance, while protecting private identities and commercial terms. Finance keeps recognized obligations separate from simulations. Independent approval is required, and verified paid remains zero without bank evidence. Delivery or a simulated payment cannot close unresolved financial obligations.”

Evidence: use actual same-scenario QR token; no invented provider receipt. Do not replace a suppressed metric with a fabricated percentage.

## Scene 6 — Responsible design and reset (2:15–2:40; 25 seconds)

Screen: evidence/limitations page and the reset confirmation; show changed scenario generation and clean initial totals. The optional local wearable simulator may be shown only as a separately labeled synthetic concept, if time permits.

Narration: “Public claims distinguish proposals, synthetic data and evidence-backed observations. Health monitoring is outside the commercial data flow. A visitor can recreate their own scenario without deleting immutable history or affecting another visitor. Reset restores a documented initial state rather than rewriting a financial ledger. Our tests check isolation, replay and failure behavior.”

Evidence: actual reset response and fresh scenario. Never show a commerce reset as deletion of personal wearable history.

## Scene 7 — Progress and next validation (2:40–3:00; 20 seconds)

Screen: neutral limitations summary. Show only finalized software test counts from the engineering evidence file, or omit counts. No institution/team identities until the official anonymity policy is checked.

Narration: “The current result is a connected software prototype tested with synthetic records. It does not establish income gains, verified payments or injury prevention. Next are owner acceptance, ethical user research and reviewed operating policies. A live pilot requires independent inventory, financial, legal and deployment validation.”

Evidence: current software results, clearly dated. Close without a partner logo or submission-completed claim.

## Recording and editing checklist

1. Launch only the isolated showroom; select a fresh visitor generation. Record the fixture/scenario version privately in the evidence register.
2. Complete a rehearsal with real APIs. Capture the RFQ/quote, voluntary acceptance, production, QA, custody, buyer confirmation, QR, finance and reset in order. Do not splice different visitors' records into one purported scenario.
3. Use 16:9 capture with readable text and limited pointer motion. Crop chrome before recording, retain material evidence labels, and respect reduced motion. Do not accelerate an inaccessible screen until its labels become unreadable.
4. Record narration in a quiet setting, then time it at a natural pace. The proposed narration must be shortened or retaken to match the planned slots; a 180-second storyboard does not prove actual length.
5. Use minimal cuts and neutral transitions. Add captions matching the final narration. Do not use stock footage as evidence of project field work.
6. Inspect every frame and audio channel for personal names, institution/team cues, credentials, local usernames, unverified logos and misleading claims.
7. Export only after the actual organizer format is confirmed. Inspect container metadata, filename, subtitles, thumbnail and credits for identity cues.
8. Play the entire final render, measure actual duration with a media inspector, review audio and captions, verify readability and warnings, and record reviewer/date/findings.
9. Obtain owner sign-off. Submission/upload is a separate owner action; this package performs neither.

## Rendered candidate and review limits

Candidate output: `output/video/PHASE1_PROGRESS_REVIEW.mp4`. Build: `python3 scripts/render-phase1-video.py`, using ffmpeg, ffprobe and local espeak. Source capture: the real-API browser test with `BATCH7_CAPTURE_DIR`; eight milestone PNGs are retained privately under `.local/batch7/capture/`. The seven rendered scenes use showroom overview, artisan acceptance, QA, public traceability and finance captures. These still images summarize the workflow; they do not visually demonstrate every action in the fuller recording plan above. No personal voice, real participants or stock field footage is used.

The first narration build exceeded scene slots; the closing narration was shortened and every segment is checked before rendering. The final measured artifact, scene samples, full decode, audio signal and metadata checks are recorded in ARTIFACT_VALIDATION.md. Synthetic account labels are fictional but product branding may still identify an entry. Full human playback, spoken clarity, organizer anonymity interpretation and named owner approval remain pending. Nothing has been uploaded.
