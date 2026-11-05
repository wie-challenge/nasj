# Nasouj knowledge base

Short Markdown articles that teach Nasouj how NASJ works. Nasouj answers "how do I…" questions **only** from these articles, so an article that is wrong produces wrong answers.

## Folders: who can see what

The folder decides which users' questions can use an article. Each role profile lists its folders in `profile.yaml`.

| Folder | Seen by | Owner |
| --- | --- | --- |
| `shared/` | Everyone | Person C |
| `general/` | Everyone | Person C |
| `buyer/` | Company owners (`BUYER_REPRESENTATIVE`) | Person B |
| `association/` | Organization owners (`ASSOCIATION_COORDINATOR`) | Person C |
| `admin/` | NASJ staff (`PLATFORM_ADMIN`, `NASJ_OPERATOR`) | Person A |

Never put admin-only or internal information in `shared/` or `general/`.

## File format

One file per topic. The file name is the article id, for example `association/association-register-artisan.md`.

```markdown
---
id: association-register-artisan        # same as the file name, lowercase-with-dashes
status: live                            # live | simulated | planned
routes: [/association/artisans/new]     # website pages this article is about (optional)
last_verified: 2026-10-29               # date you checked it against the real website
source: docs/role-model-decision.md     # where the facts come from (doc, backlog story, commit)
---
# Register an artisan

What the page is for, in one or two sentences.

## Steps
1. ...

## Good to know
- Rules, limits, common problems.
```

| `status` | Use when | Nasouj will |
| --- | --- | --- |
| `live` | The feature works in the website today | Explain it normally |
| `simulated` | It works, but with demo data or fake payments | Explain it and say it is a demonstration |
| `planned` | It is in the backlog but not built | Say it is coming; give no steps |

## Writing rules

1. **Check before you write.** Open the page in the local website (`pnpm dev` in `website/`, demo accounts in `website/.local/dev-credentials.json`) and click through it. Only write what you saw or what the source doc states.
2. **150–400 words** (the checker allows 30–800). One topic per article. Short steps.
3. Use the words the website shows on screen (page titles, button labels).
4. No personal data, no real names, no passwords, no internal secrets.
5. Write in the agreed article language. Nasouj translates when answering.
6. When the website changes, update the article and its `last_verified` date in the same week.
7. For each article, add 2–3 test questions in `evaluation/assistant/` (see the README there).

## Check your work

```bash
python scripts/check_content.py
```

It lists article counts per folder and status, and prints `ERROR` lines for anything invalid: bad frontmatter, id not matching the file name, wrong folder, missing title, too short or too long. CI runs it on every push.
