# Nasouj: team tasks

Companion to the [technical plan](nasouj-assistant-plan.md). Dates follow the competition: **Phase A demo on 5 November**, **prototype on 10 December 2026**.

## What already works (foundation, 29 October)

In `ai-backend`:

- RabbitMQ and Redis run in Docker (`compose.yaml`).
- The Nasouj worker takes a chat request from RabbitMQ, picks the user's **role profile**, builds an isolated prompt and calls the model. It streams the answer back as `delta` messages, then `done` (or `error`).
- A model rate limit is shared through Redis.
- Three starter role profiles: `buyer`, `coordinator`, `admin`.
- The model is **fake** until a key is set; switching to NVIDIA is three lines in `.env` (see the README).
- `scripts/send_test_message.py` plays the part of NestJS for testing.
- Tests cover the message contract, profiles, prompt isolation, the pipeline and the rate limiter.
- `knowledge/`: five folders, writing guide and one sample article. `evaluation/assistant/`: one question file per owner, format guide and example questions. `scripts/check_content.py` validates both and runs in CI.

In `website`:

- `packages/contracts/src/assistant.ts`: the same message formats in Zod, checked against messages produced by the Python worker.
- Starter folders with READMEs: `apps/api/src/modules/assistant/` (NestJS) and `apps/web/src/components/assistant/` (chat widget).

**Not built yet:** retrieval, safety checks beyond validation, the NestJS module code, the chat widget code, conversation storage, the eval runner, tools.

## Team

| Person | Shared layer | Role profile owned |
| --- | --- | --- |
| **A** | AI engine in `ai-backend` | NASJ admin / operator (`admin`) |
| **B** (lead) | Website integration (NestJS + chat widget) | Company owner (`buyer`) |
| **C** | Knowledge base and quality | Organization owner (`coordinator`) |

Owning a role profile means writing its `prompt.md`, its articles and its test questions, and reviewing its answers each week.

## How we work

- **Day 1 for everyone:** follow the [README](../README.md) "Run locally" steps, then run `send_test_message.py` and see a `done` line. Then create a free NVIDIA Build account and put **your own** key in **your own** `.env`.
- One branch and one pull request per task. Another team member reviews every PR.
- Before opening a PR, run `ruff check .`, `ruff format --check .`, `mypy src tests scripts`, `pytest` and `python scripts/check_content.py`; they must pass.
- **The message contract is `src/nasj_ai/assistant/schemas.py`** (Python) and **`website/packages/contracts/src/assistant.ts`** (Zod). Any change updates both sides in the same week, and the team is told.
- Never commit `.env`, keys or real personal data. Use demo data only.
- Weekly 30-minute review: run the eval set, read the worst answers, assign fixes.

## Week 0: foundation (29 Oct – 4 Nov)

| ID | Who | Task | Done when |
| --- | --- | --- | --- |
| T0.1 | All | Local setup + NVIDIA key (see "How we work") | Everyone gets a real NVIDIA answer from `send_test_message.py` |
| T0.2 | All | 1-hour meeting: fill plan section 5.2 (what each role gets help with and must refuse); choose article language and Nasouj's tone | Table 5.2 filled in and committed |
| A1 | A | Compare 2–3 NVIDIA catalog chat models (tool-calling support, Arabic/French/Darija quality, speed) on the same 20 questions | Short note in `models/README.md`; chosen model ID shared with the team |
| B1 | B | NestJS `assistant` module (plan in `apps/api/src/modules/assistant/README.md`): RabbitMQ connection (`amqplib` + `amqp-connection-manager`), publish an `AssistantChatRequest` (from `@nasj/contracts`) built from the actor's context, one exclusive reply queue per process, route replies by `correlation_id` | A NestJS test or script gets a full answer from the running worker |
| B2 | B | Endpoint `POST /api/v1/assistant/conversations/:id/messages` that streams replies to the browser (SSE); **verify streaming passes through the Next.js `/api` rewrite** | Answer appears word by word in the browser (a plain test page is fine) |
| C1 | C | Folders, format and guide are ready (`knowledge/README.md`). Confirm the sample article against the website screens, then write 4 more articles | `check_content.py` passes; A has agreed the format |
| C2 | C | Format and examples are ready (`evaluation/assistant/README.md`). With A and B, reach 30 questions: 10 per role, in the owner's file | `check_content.py` passes; reviewed by A and B |

## Phase A demo (5 Nov)

| ID | Who | Task | Done when |
| --- | --- | --- | --- |
| D1 | All | Demo: each role asks one general and one app question in the browser; Nasouj answers in French and Arabic with the real model | 3-minute screen recording; known limits written down honestly |

Until retrieval exists, app answers can only come from the role prompts. Keep demo questions to what those prompts truly cover.

## Weeks 1–3: role profiles and knowledge (5 – 22 Nov)

| ID | Who | Task | Done when |
| --- | --- | --- | --- |
| A2 | A | Retrieval v1: load and validate articles, chunk, embed (hosted NVIDIA model or local multilingual model), in-memory search limited to the profile's `knowledge` folders, boost by current route, add results to the prompt as a labelled reference layer, list `knowledge_ids` in `done` | Unit tests prove a buyer never retrieves `admin/` articles; an Arabic question finds a French article |
| A3 | A | Token usage in `done` if NVIDIA returns it; trim history to fit the chosen model's context | `usage` filled or documented as unavailable; long chats don't fail |
| A4 | A | `safety.py`: strip control characters, flag known injection patterns, block answers that reveal the system prompt | Tests with C's injection questions |
| A5 | A | Admin profile: refine `admin/prompt.md`, write ~12 `admin/` articles, 15 admin test questions | Admin eval questions pass the agreed bar |
| B3 | B | Prisma models `AssistantConversation`, `AssistantMessage`, `AssistantFeedback` + migration; load last 10 messages; cache user context and recent history in Redis (`ioredis`) with the keys and expiries in plan section 7; delete the context key when a user's roles or permissions change | Conversation survives a page reload; revoked permission takes effect at once |
| B4 | B | Chat widget in the protected layout: streaming text, Arabic right-to-left with Tajawal, NASJ colours, busy/error states, 👍/👎, "open a support case" link | Works for all three roles in Chrome and on a phone width |
| B5 | B | Per-user message limit (existing rate limiter), 90-second timeout, clear "Nasouj is busy" state | Tested by stopping the worker mid-answer |
| B6 | B | Buyer profile: refine `buyer/prompt.md`, ~12 `buyer/` articles, 15 buyer test questions | Buyer eval questions pass the agreed bar |
| C3 | C | ~12 `shared/` and `general/` articles | Reviewed by the persona owners |
| C4 | C | Eval runner: send every question through RabbitMQ (reuse `send_test_message.py`), respect the rate limit, write a report (pass/fail per question, by role and language) | One command produces the weekly report |
| C5 | C | Injection, cross-role and other-organization test questions for every role, plus Darija phrasings | At least 10 per role in the eval set |
| C6 | C | Coordinator profile: refine `coordinator/prompt.md`, ~12 `association/` articles, 15 coordinator test questions | Coordinator eval questions pass the agreed bar |

## Weeks 4–5: tools (23 Nov – 3 Dec)

Only for the tools agreed in plan section 5.2. Read-only.

| ID | Who | Task | Done when |
| --- | --- | --- | --- |
| A6 | A | Tool-calling loop in the pipeline: tool definitions, `tool_call` reply event, wait for the result message, continue the answer | Works with B's endpoints for one tool per role |
| B7 | B | NestJS executes each tool **as the user**, with existing permission checks, and returns the result through RabbitMQ | Tests prove a user can never get another organization's data |
| C7 | C | Tool test questions, plus a re-run of the full eval set | Report shows no regression |

## Week 6: prototype (4 – 10 Dec)

| ID | Who | Task | Done when |
| --- | --- | --- | --- |
| P1 | B | Deployment of website + ai-backend + RabbitMQ + Redis for the demo (private networking, separate RabbitMQ users, secrets outside Git) | Demo environment reachable by the team |
| P2 | All | Demo script per role, rehearsal, known limits stated honestly | Rehearsed twice |

## Definition of done (every task)

- Code checks pass; tests are added for new behaviour.
- PR reviewed by another team member.
- README or plan updated if behaviour or setup changed.
- No secrets, keys or personal data committed.
