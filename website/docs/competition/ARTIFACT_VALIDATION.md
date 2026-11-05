# Phase 1 artifact validation — review candidates

Engineering inspection: 27–28 October 2026, Africa/Tunis. Reviewer: automated tools and coding-agent visual inspection; named independent reviewer and owner approval **not supplied**. These checks establish reviewable files, not entry eligibility, originality, organizer acceptance or permission to submit. Final hashes and measured media properties are in [artifact-validation.json](../engineering/evidence/batch7-20261027/artifact-validation.json).

## Technical report

Editable source: [PHASE1_TECHNICAL_REPORT.md](PHASE1_TECHNICAL_REPORT.md). Candidate: [PHASE1_TECHNICAL_REPORT.pdf](../../output/pdf/PHASE1_TECHNICAL_REPORT.pdf). Built with `scripts/render-phase1-report.py` using ReportLab; inspected with pypdf, pdfinfo and pdftoppm.

- Six A4 pages, below or equal to the organizer's six-page maximum. Abstract: **204 words**. Keywords: **five**. Required sections, references R1–R9 and tracked limitations G1–G8 are present.
- All six pages were rendered to PNG and visually inspected. An initial crowded methodology page was rebalanced; final text, references and footers are separated and readable. Final reference edits were rendered and rechecked. The chosen font/margins are editorial choices: the reviewed brief provides no template.
- PDF author metadata is empty. No member names, institution, personal email or user paths are included in the rendered report. Project name, repository URLs and source paths remain; owner must decide applicable identity treatment. The brief expressly requires anonymity for video, without a separate report anonymity instruction.
- Assertions are limited to software behavior and synthetic assumptions. Historical Batch 5 counts are dated; final Batch 7 execution belongs in its engineering report. No interviews, impact study, paid income, bank verification, AI benchmark or hardware certification is fabricated.

**Outcome:** report structure, range, page count and visual preparation verified for this candidate. Independent citation/originality/AI-use review, research dependencies and final owner acceptance remain open. Rebuilding the file invalidates its recorded hash and requires renewed review.

## Progress video

Candidate: [PHASE1_PROGRESS_REVIEW.mp4](../../output/video/PHASE1_PROGRESS_REVIEW.mp4). Editable narration/capture plan: [PHASE1_VIDEO_STORYBOARD.md](PHASE1_VIDEO_STORYBOARD.md). Build: `python3 scripts/render-phase1-video.py`; local ffmpeg, ffprobe and espeak. No external speech service, private voice or stock field footage.

This is a seven-scene montage of actual browser screenshots captured by the real-API showroom test in one disposable visitor scenario, with local synthetic narration and burned captions. It is **not a continuous screen recording**. The fuller action-by-action recording plan remains in the storyboard; the current stills do not visibly perform every narrated action. Capture hashes and exact narration are in [video-build.json](../engineering/evidence/batch7-20261027/video-build.json).

Final technical inspection records **180.046 seconds**, 1280 × 720 resolution, H.264 video, AAC mono audio, full-stream decoding and signal checks (mean −21.4 dB, peak −0.1 dB).  Seven scene samples—including beginning/end contexts—are inspected for readable captions, provenance labels and unintended identity cues. The first render exposed a loading QA panel and a finance screen above the payable section; those captures are replaced with loaded workflow content before the final review. Caption/header bands keep the synthetic warning visible. No transitions or success effects turn simulated events into field evidence.

The visible account labels are fictional; there are no credentials, browser/OS chrome, institution badges, real people, personal email or local user paths in the selected screenshots. The application retains its NASJ product branding and fictional initials; this can still identify the entry. Container metadata has no named author/artist/comment. **Anonymity is not certified:** the organizer gives no detailed branding interpretation, no roster was supplied for comparison, and owner review remains necessary.

**Outcome:** rendered media and engineering decode/sample checks are recorded in the JSON record and raw video logs. Full independent human playback, spoken clarity and synchronization review, branding/anonymity approval, official upload/timing tolerance and final owner sign-off remain **pending**. Signal levels and a successful decoder are not substitutes for listening to the full video. No upload or competition submission occurred.

## Reproduction and review gates

1. Run the isolated real-API capture: `BATCH7_CAPTURE_DIR=/absolute/path/to/website/.local/batch7/capture pnpm test:e2e:demo`. This creates disposable databases; do not run persistent `demo:setup` for artifact tests.
2. Render the editable report with `.local/artifact-venv/bin/python scripts/render-phase1-report.py` (Python ReportLab and pypdf required). Render its pages with pdftoppm and inspect every page.
3. Render the video with `python3 scripts/render-phase1-video.py`; inspect the full file, all scene samples, audio and metadata. Record current hashes and exact checks; old records must not be reused after edits.
4. Run `pnpm competition:validate`. This verifies the source constraints, real media properties and matching recorded hashes. Its pass does not approve eligibility, originality, anonymity, portal compliance or owner sign-off.
5. Complete the independent reviews and named approvals in [PHASE1_SUBMISSION_CHECKLIST.md](PHASE1_SUBMISSION_CHECKLIST.md), then freeze approved bytes. Submission requires a separate authorized action.

## Git packaging

The PDF and editable sources are versioned. Generated `output/video/` stays local because the repository commit hook rejects files above 500 KB; the current MP4 exceeds that limit. Its build script, storyboard, measured hash and validation records are versioned. Recreate disposable capture images and render the video before running full `pnpm competition:validate` in a new checkout. No release asset was uploaded.
