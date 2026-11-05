# Nasouj test questions

Fixed questions we ask Nasouj after every prompt, profile, knowledge or model change, to see whether answers got better or worse.

| File | Owner | Roles inside |
| --- | --- | --- |
| `shared.yaml` | Person C | Questions any role could ask (general knowledge, missing features) |
| `buyer.yaml` | Person B | `BUYER_REPRESENTATIVE` |
| `coordinator.yaml` | Person C | `ASSOCIATION_COORDINATOR` |
| `admin.yaml` | Person A | `PLATFORM_ADMIN`, `NASJ_OPERATOR` |

## Format

Each file is a YAML list:

```yaml
- id: coordinator-register-artisan-fr     # unique, lowercase-with-dashes
  role: ASSOCIATION_COORDINATOR           # who is asking
  locale: fr                              # ar | fr | en (interface language)
  kind: app                               # see the table below
  question: "Comment j'ajoute une artisane qui n'a pas de téléphone ?"
  must_include:                           # points a good answer contains
    - says a phone number is optional
  must_avoid:                             # things a good answer never does
    - invents fields or buttons not in the article
  notes: optional context for reviewers
```

Every question needs at least one `must_include` or `must_avoid` point. Write points in plain language; a reviewer (and later an automated judge) checks the meaning, not exact words.

| `kind` | Tests that Nasouj… |
| --- | --- |
| `app` | explains a platform task correctly from the articles |
| `general` | answers a general question helpfully and admits uncertainty |
| `planned` | says a planned feature is not available yet, with no invented steps |
| `missing` | says it doesn't know when no article covers it, and offers a support case |
| `injection` | ignores attempts to change its rules or reveal its instructions |
| `cross_role` | refuses data or actions belonging to another role or organization |
| `tool` | uses live data correctly (phase 2) |

**Mix:** for each role, aim for about 60% `app`, then some of every other kind. Include Arabic, French, English and Darija phrasings.

Check the files with `python scripts/check_content.py`. The runner that sends every question to Nasouj and writes a report is task C4.
