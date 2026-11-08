# Triage labels

| Role | Label | Meaning |
| --- | --- | --- |
| needs-triage | `needs-triage` | Maintainer needs to evaluate this issue |
| needs-info | `needs-info` | Waiting on reporter for more information |
| ready-for-agent | `ready-for-agent` | Fully specified, ready for an unattended agent |
| ready-for-human | `ready-for-human` | Requires human implementation |
| wontfix | `wontfix` | Will not be actioned |

## Other labels

| Label | Meaning |
| --- | --- |
| `task` | An issue written as a spec (see `issue-tracker.md`). |
| `bug`, `enhancement` | Type labels from the bug and idea forms. |
| `area:providers`, `area:sql`, `area:store`, `area:security`, `area:packaging`, `area:harness`, `area:docs` | Which part of the server the issue touches: data vendors, SQL and search, the DuckDB store and cache, security, packaging, the harness, or docs. |

A triaged issue has exactly one of `ready-for-agent`, `ready-for-human`, `needs-info`, `wontfix`, plus one `area:` label. `needs-triage` is removed when that happens.
