# Easy Music Documentation Guide

This is the entry point for project documentation and the mandatory governance
rule for keeping it consistent.

## Core Rule: One Fact, One Owner

Every project fact has one canonical document. Other documents may provide a
short audience-specific summary, but they must link to the canonical source
instead of copying detailed status, evidence, or procedures.

| Information | Canonical owner | Other documents may |
| --- | --- | --- |
| Current project status and next authorized work | `docs/ROADMAP.md` | Summarize and link |
| Product intent, scope, and non-goals | `docs/PRD.md` | Reference the relevant requirement |
| Current system design and module boundaries | `docs/ARCHITECTURE.md` | Link, not restate the design |
| One work item's scope and implementation checklist | One file under `docs/TASKS/` | Link from the roadmap while active |
| Verification evidence and acceptance decision | One file under `docs/ACCEPTANCE/` | State only the resulting status |
| Local development procedure | `docs/DEVELOPMENT.md` | Provide a short command overview |
| Production procedure | `docs/DEPLOYMENT.md` | Provide a short deployment overview |
| Configuration contract | `docs/ENVIRONMENT.md` and committed env examples | Reference variable names |
| Stable instructions for agents | `AGENTS.md` | Never carry time-sensitive project status |
| Public project overview | `README.md` and `README.zh-CN.md` | Mirror the roadmap at summary level |

When two documents disagree, fix the canonical owner first and then update or
remove the stale summary. Acceptance records are evidence: do not rewrite a
past result merely to make it match a newer plan.

## Reading Routes

| Goal | Read in this order |
| --- | --- |
| Start or continue product work | `docs/ROADMAP.md` → linked task → linked acceptance → relevant PRD/architecture section |
| Set up a development machine | Root README → `docs/DEVELOPMENT.md` → `docs/ENVIRONMENT.md` |
| Change an API or cross-client contract | Relevant task/spec → `docs/ARCHITECTURE.md` → `docs/API_MANUAL_TESTING.md` |
| Deploy or operate production | `docs/DEPLOYMENT.md` → `docs/ENVIRONMENT.md` → production smoke acceptance |
| Understand why an old milestone is accepted | Roadmap row → linked acceptance record → historical task only if needed |

Do not read every task and acceptance file before ordinary work. Start from the
roadmap and follow only the links relevant to the selected slice.

## Status Vocabulary

Use these delivery statuses for roadmap rows, task records, and acceptance
records:

- `Planned`: approved scope exists, implementation has not started.
- `In progress`: implementation or verification is underway.
- `Implemented`: code exists, but required acceptance is not complete.
- `Accepted`: the documented acceptance criteria and required checks passed.
- `Deferred`: intentionally postponed, with a reason or prerequisite.
- `Superseded`: replaced by another named document or work item.

Do not use `done`, `complete`, and `accepted` interchangeably. A feature can be
implemented without being accepted.

Specifications use `Draft`, `Active`, or `Superseded`. Incident records use
`Investigating`, `Resolved`, or `Superseded`. These describe the document's own
lifecycle, not feature acceptance.

## Documentation Structure

- Root `README.md` and `README.zh-CN.md`: public overview and quick start.
- `docs/ROADMAP.md`: current status register, active work, and historical
  milestones.
- `docs/PRD.md`: durable product intent and scope.
- `docs/ARCHITECTURE.md`: current implemented architecture.
- `docs/SPECS/`: durable design decisions for a specific subsystem.
- `docs/TASKS/`: scoped plans and completion notes. Completed task files remain
  historical records; they are not the current status source.
- `docs/ACCEPTANCE/`: verification evidence. These records must say what was
  tested, when, and with what result.
- `docs/DEBUGGING/`: durable incident analysis or non-obvious diagnostic
  knowledge.
- `docs/TEMPLATES/`: required starting structures for new controlled records.
- `docs/DEVELOPMENT.md`, `docs/DEPLOYMENT.md`, `docs/ENVIRONMENT.md`, and
  `docs/API_MANUAL_TESTING.md`: operational references.

Do not create parallel documents named `FINAL`, `LATEST`, `NEW`, or `V2` merely
to avoid updating an existing canonical document. Create a new task, spec, or
acceptance file only when it represents a genuinely separate work item or
decision.

Use one task/acceptance pair per reviewable feature slice, not per commit. A
small fix inside an active slice belongs in that slice's existing records. A
standalone minor fix that does not change roadmap status or a durable contract
may record its checks and `Documentation Impact` in the change summary instead
of creating two low-value files. This exception does not apply to a completed
feature, milestone, API contract change, migration, or deployment change.

## Naming And Record Lifecycle

- Use `<SLICE>_TASKS.md` and `<SLICE>_ACCEPTANCE.md` for a feature slice.
  Cross-link general context through `Related`, and declare the delivery
  counterpart explicitly through `Pair`.
- Use stable feature names. Do not put `FINAL`, `LATEST`, `NEW`, `NEXT`, or
  `REMAINING` in new filenames.
- Keep an accepted historical record in place. If another document replaces
  it, set `Status: Superseded` and link the replacement instead of duplicating
  or deleting history.
- One roadmap row may have one active task/acceptance pair. Split genuinely
  independent deliverables into separate rows and pairs.
- Start from the matching file in `docs/TEMPLATES/`; do not invent a parallel
  format.

## Required Header For Controlled Documents

Every file under `docs/TASKS/`, `docs/ACCEPTANCE/`, `docs/SPECS/`, and
`docs/DEBUGGING/` must begin with:

```markdown
# Document title

Status: Planned
Last updated: YYYY-MM-DD
Canonical role: task | acceptance | specification | incident
Related: `path/to/related-document.md`
```

Use `Related: None` when no related document exists. Update `Last updated` only
when meaning changes, not for formatting-only edits. Keep all `Related` paths
on that single metadata line.

Task and acceptance records must also include:

```markdown
Pair: `docs/ACCEPTANCE/<SLICE>_ACCEPTANCE.md`
```

`Pair` contains only delivery counterpart paths, not general references. Every
paired path must also appear in `Related`. Both sides must list each other and
share the same delivery status. `Pair: None` is allowed only for a superseded
task or for a legacy/operational exception that explains the absence with
`Legacy record note:` or `Operational record note:`.

Acceptance records must additionally include `Decision`, using the same
delivery vocabulary as `Status`. `Decision`, `Status`, and the
`Current decision` value in any present `Acceptance Decision` section must
agree. Open records must contain that section. This prevents a heading from
being promoted while the evidence decision still says otherwise.

```markdown
Decision: Planned
```

The automated checker rejects missing fields, unknown statuses, incorrect
roles, invalid dates, missing related or paired files, one-sided pairs, and
status/decision mismatches.

## Documentation Done Gate

Documentation updates are part of the same feature or fix, not a later cleanup
task. Before an agent reports a work item complete, it must inspect this matrix
and update every required owner in the same logical change.

| Change type | Required updates |
| --- | --- |
| Feature or milestone change | Relevant task file and acceptance evidence |
| Small fix within an active slice | Existing task/acceptance notes; avoid a duplicate document |
| Project status or next-work change | `docs/ROADMAP.md` |
| User-visible capability or top-level status change | Both `README.md` and `README.zh-CN.md` |
| Product scope or non-goal change | `docs/PRD.md` |
| API, data model, module boundary, or durable flow change | `docs/ARCHITECTURE.md` and any relevant spec |
| Local setup, command, dependency, or verification change | `docs/DEVELOPMENT.md` |
| Environment variable or default change | `docs/ENVIRONMENT.md` and matching env examples |
| Deployment, storage, backup, TLS, or operations change | `docs/DEPLOYMENT.md` and relevant deployment files |
| API smoke flow change | `docs/API_MANUAL_TESTING.md` |
| Newly discovered stable agent pitfall or invariant | `AGENTS.md` |

For every row that appears relevant but is not updated, record `N/A` and the
reason in the task's `Documentation Impact` section or in the final change
summary. "Updated one document" is not evidence that documentation is complete.

### Completion Sequence

1. Before implementation, identify the task document and list likely document
   impacts.
2. During implementation, update contract and procedure documents alongside
   the code that changes them.
3. Record actual verification in the acceptance document. Never mark
   `Accepted` from implementation alone.
4. Update the task status and completion notes.
5. Update `docs/ROADMAP.md` if status, caveats, or next work changed.
6. Update both READMEs only when their public summary changed.
7. Run the documentation checker and inspect the final diff.

Use this task section:

```markdown
## Documentation Impact

- [ ] Task status and completion notes
- [ ] Acceptance evidence
- [ ] Roadmap status or next work
- [ ] English and Chinese README summaries
- [ ] PRD / architecture / specification
- [ ] Development / environment / deployment / API testing
- [ ] AGENTS.md stable rules

N/A reasons:

- ...
```

## Automated Check

Run from the repository root with PowerShell 7:

```powershell
pwsh -File scripts/check-docs.ps1
```

The checker validates local Markdown links, required canonical/template files,
controlled-record headers and relationships, matching status snapshot dates
and roadmap-status signatures in both READMEs, the agent completion gate, and
registration of open task/acceptance records in the roadmap. A roadmap row
must match the status of every controlled record it links. Declared
task/acceptance pairs must be reciprocal and share a status; acceptance
`Decision` metadata and any recorded current decision must match it too. Open
tasks must have a `Documentation Impact` section, and open acceptance records
must have an `Acceptance Decision` section. The checker also rejects an
`Accepted` record that still contains unchecked checklist items. It cannot
judge semantic truth, so the documentation matrix and acceptance review remain
mandatory.

The same command runs in `.github/workflows/documentation-check.yml` for pull
requests and pushes to `main` or `develop`. The pull request template requires a
concise documentation-impact declaration so omissions remain visible even when
they cannot be inferred automatically.
