# Documentation Guide

The docs have two readers: agents changing the code, and the owner operating
the system. Each fact has one home; other documents link to it instead of
copying it.

## Map

| Document | Owns | Update when |
| --- | --- | --- |
| [ROADMAP.md](ROADMAP.md) | The only status register: open slices, what each still needs, candidate next work, history. | A slice opens, changes status, or closes. |
| [PRD.md](PRD.md) | Product intent, core concepts, non-goals. | Product scope or a non-goal changes. |
| [ARCHITECTURE.md](ARCHITECTURE.md) | How the system works now: components, data rules, pipelines, API surface, security. | An API, data model, pipeline, or module boundary changes. |
| [DEVELOPMENT.md](DEVELOPMENT.md) | Local setup, commands, checks, smoke flows, git workflow. | A setup step, command, or check changes. |
| [ENVIRONMENT.md](ENVIRONMENT.md) | Environment variable contract, with `.env.example` and `.env.production.example`. | A variable or default changes (update all three). |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Production setup, updates, backups, restores, troubleshooting. | Any production procedure changes. |
| [API_MANUAL_TESTING.md](API_MANUAL_TESTING.md) | Hand-run API smoke flows. | A flow it shows changes. |
| `TASKS/` | One record per slice: problem, scope, verification. | While the slice is open. |
| `SPECS/` | Design of one subsystem too detailed for the architecture doc. | That design changes. |
| `DEBUGGING/` | Incidents whose diagnosis is worth remembering. | After the investigation. |
| `ACCEPTANCE/` | Verification evidence from slices before November 2026. | Only to close a legacy slice. |
| [../AGENTS.md](../AGENTS.md) | Rules and invariants for agents. | A stable rule or pitfall changes. |
| [../README.md](../README.md), [../README.zh-CN.md](../README.zh-CN.md) | Public overview and quick start. | Features or setup change; keep both languages in step. |

## Slice Records

A slice is one owner-visible problem solved end to end. It needs a record when
it adds a feature, changes behaviour the owner will notice, or changes an API,
the data model, or deployment. Refactors, test-only changes, and small fixes
need only a clear commit message.

Create `docs/TASKS/<SLICE_NAME>.md` from
[the template](TEMPLATES/TASK_TEMPLATE.md). It starts with:

```markdown
# Slice Title

Status: In progress
Last updated: YYYY-MM-DD
Related: `docs/ROADMAP.md`
```

`Related` is optional and lists repository-relative paths in backticks. Add a
row to the roadmap's Open Work table while the slice is open, and move it to
History when it is `Accepted` or `Superseded`.

## Status Vocabulary

| Status | Meaning |
| --- | --- |
| `Planned` | Scoped, not started. |
| `In progress` | Being implemented. |
| `Implemented` | Code is on `main` and automated checks passed; owner checks remain. |
| `Accepted` | Every check in the record passed, including the owner's checks in real use. |
| `Deferred` | Postponed, with the reason in the record. |
| `Superseded` | Replaced; the record links what replaced it. |

An agent may set `Accepted` only when the record lists no owner checks, or the
owner has reported the result; record the date and what the owner checked.
Specifications use `Draft`, `Active`, or `Superseded`; incident records use
`Investigating`, `Resolved`, or `Superseded`.

## Legacy Records

Slices before November 2026 used a `TASKS/*_TASKS.md` and
`ACCEPTANCE/*_ACCEPTANCE.md` pair linked by a `Pair:` line. Leave them as they
are. When you close one, change `Status` in both files and the `Decision:` and
`Current decision:` lines in the acceptance file, then record the evidence
there. Do not start new pairs.

## Automated Check

```powershell
pwsh -File scripts/check-docs.ps1
```

It checks local Markdown links, record headers and statuses, that every open
slice has a roadmap row with the same status, that legacy pairs agree, and
that no `Accepted` record still has an unchecked box. It runs in CI on every
pull request. It cannot judge whether a document is true; that is the
author's job.

## Writing Rules

- Write what is true now and what to do. History belongs in git and in slice
  records.
- Link rather than copy. Do not restate what the code already says clearly,
  such as field lists or endpoint signatures, unless the document adds a rule
  the code does not show.
- Update the owning document instead of creating `FINAL`, `NEW`, or `V2`
  copies.
