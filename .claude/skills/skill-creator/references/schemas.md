# Schemas

JSON structures used by the skill-creator loop. Everything here is a *contract*:
`eval-viewer/generate_review.py`, `scripts/aggregate_benchmark.py`, and the grader
all read and write these files, so field names matter. When a field name is called
out below as required, changing it silently breaks the viewer.

## Table of contents

- [Workspace layout](#workspace-layout)
- [Run IDs and configuration names](#run-ids-and-configuration-names)
- [evals/evals.json](#evalsevalsjson)
- [eval_metadata.json](#eval_metadatajson)
- [timing.json](#timingjson)
- [grading.json](#gradingjson)
- [benchmark.json](#benchmarkjson)
- [feedback.json](#feedbackjson)
- [Trigger eval set](#trigger-eval-set)
- [Advice for writing these files](#advice-for-writing-these-files)

---

## Workspace layout

Results live in `<skill-name>-workspace/`, a sibling of the skill directory.
Iterations are separate directories so nothing is overwritten between rounds.

```
my-skill-workspace/
├── skill-snapshot/                 # only when improving an existing skill
├── iteration-1/
│   ├── benchmark.json
│   ├── benchmark.md
│   ├── feedback.json               # copied here after the human reviews
│   └── eval-0-descriptive-name/    # one directory per test case
│       ├── eval_metadata.json
│       ├── with_skill/
│       │   ├── outputs/            # the artifacts the run produced
│       │   ├── grading.json
│       │   └── timing.json
│       └── without_skill/          # or old_skill/ when improving a skill
│           ├── outputs/
│           ├── grading.json
│           └── timing.json
└── iteration-2/
```

Directories are created as you go, not upfront. The eval directory name should be
descriptive (`eval-0-missing-axis-labels`), not just `eval-0`.

---

## Run IDs and configuration names

A **run** is one (test case × configuration) pair. Its id is
`<eval-directory-name>-<configuration>`:

```
eval-0-missing-axis-labels-with_skill
eval-0-missing-axis-labels-without_skill
```

The three configuration names are fixed, because the viewer and the aggregator
both switch on them:

| Configuration | Meaning |
|---|---|
| `with_skill` | The skill under development is available. |
| `without_skill` | Baseline when creating a new skill: no skill at all. |
| `old_skill` | Baseline when improving an existing skill: the pre-edit snapshot. |

In the benchmark, `with_skill` must be listed **before** its baseline.

---

## evals/evals.json

The test set, saved next to the skill. Prompts are written first; `assertions`
are added once they've been drafted (usually while the runs are in flight).

```json
{
  "skill_name": "example-skill",
  "evals": [
    {
      "id": 1,
      "prompt": "User's task prompt",
      "expected_output": "Description of expected result",
      "files": [],
      "assertions": []
    }
  ]
}
```

- `id` — integer, stable across iterations.
- `prompt` — the exact task text handed to the run.
- `expected_output` — prose description of a good result. Humans read this.
- `files` — input file paths, relative to the eval directory. `[]` if none.
- `assertions` — list of `{ "text": "..." }` objects, or plain strings (both are
  accepted). See [grading.json](#gradingjson).

---

## eval_metadata.json

One per eval directory. Written before the runs start. It carries the assertions
that the grader will later evaluate, so the grader never has to guess.

```json
{
  "eval_id": 0,
  "eval_name": "descriptive-name-here",
  "prompt": "The user's task prompt",
  "assertions": []
}
```

- `eval_name` should match the directory name's descriptive part.
- `assertions` starts empty and is filled in during step 2 of the run.

---

## timing.json

Written the moment a run completes. **`total_tokens` and `duration_ms` arrive only
in the subagent completion notification** — they aren't persisted anywhere else, so
if you don't capture them immediately they are gone and the benchmark's token and
time columns will be empty for that run.

```json
{
  "total_tokens": 84852,
  "duration_ms": 23332,
  "total_duration_seconds": 23.3
}
```

- `total_tokens` — integer, total tokens the run consumed.
- `duration_ms` — integer, wall-clock duration.
- `total_duration_seconds` — `duration_ms / 1000`, for readability. The aggregator
  derives it if absent.

---

## grading.json

One per run directory. Produced by grading each assertion against the run's
outputs.

```json
{
  "run_id": "eval-0-descriptive-name-with_skill",
  "expectations": [
    {
      "text": "The report contains axis labels on both axes",
      "passed": false,
      "evidence": "rendered page has tick marks but no axis titles"
    }
  ],
  "pass_rate": 0.0,
  "notes": "Optional free text."
}
```

**Required field names — the viewer depends on these exact spellings:**

- The array is `expectations` (not `assertions`, not `results`).
- Each entry uses `text` (not `name`), `passed` (boolean, not `met`), and
  `evidence` (a string, not `details`). Variants will render as blank rows.

Additional accepted keys per expectation, used only for display:

- `assertion` — the original assertion text, if `text` was paraphrased.
- `notes` — extra context from the grader.

`pass_rate` is `passed / total`, as a fraction between 0 and 1. The aggregator
recomputes it from `expectations` if it's missing or inconsistent, so a wrong
value here won't corrupt the benchmark — but keep it correct for readability.

If a run produced no `grading.json`, it is counted as **ungraded**, not as a
failure. Ungraded runs are excluded from pass-rate means and reported separately,
because conflating "we didn't check" with "it failed" makes the numbers lie.

---

## benchmark.json

Produced by `python -m scripts.aggregate_benchmark <iteration-dir> --skill-name <name>`.
This is exactly the shape the viewer's Benchmark tab reads.

```json
{
  "skill_name": "my-skill",
  "iteration": 1,
  "generated_at": "2026-10-06T08:30:00Z",
  "configs": [
    {
      "configuration": "with_skill",
      "runs": ["eval-0-descriptive-name-with_skill"],
      "graded_runs": 1,
      "ungraded_runs": 0,
      "pass_rate": { "mean": 0.87, "stddev": 0.05 },
      "time_seconds": { "mean": 23.3, "stddev": 1.2 },
      "tokens": { "mean": 84852, "stddev": 900.0 }
    },
    {
      "configuration": "without_skill",
      "runs": ["eval-0-descriptive-name-without_skill"],
      "graded_runs": 1,
      "ungraded_runs": 0,
      "pass_rate": { "mean": 0.62, "stddev": 0.0 },
      "time_seconds": { "mean": 18.1, "stddev": 0.0 },
      "tokens": { "mean": 71000, "stddev": 0.0 }
    }
  ],
  "deltas": [
    {
      "configuration": "with_skill",
      "baseline": "without_skill",
      "pass_rate_delta": 0.25,
      "time_seconds_delta": 5.2,
      "tokens_delta": 13852
    }
  ],
  "evals": [
    {
      "eval_name": "descriptive-name-here",
      "configs": {
        "with_skill": { "pass_rate": 0.87, "time_seconds": 23.3, "tokens": 84852 },
        "without_skill": { "pass_rate": 0.62, "time_seconds": 18.1, "tokens": 71000 }
      }
    }
  ],
  "observations": [
    "Assertion 'Output file exists' passes in both configurations — it does not discriminate."
  ]
}
```

Notes:

- `stddev` is the **sample** standard deviation (n−1). With a single run it is
  `0.0`, which is honest: one sample tells you nothing about variance. Read
  single-run configs as point estimates, not distributions.
- `deltas` compares each non-baseline configuration against the baseline. A
  positive `pass_rate_delta` means the skill helped. A positive
  `time_seconds_delta` or `tokens_delta` means it cost more.
- `evals[].configs` is the per-eval breakdown the viewer shows underneath the
  summary.
- `observations` is free-form prose, normally produced by the analyst pass.
  `aggregate_benchmark.py` fills in mechanical observations (non-discriminating
  assertions, missing timing data, high variance); the analyst adds the human
  reading on top.

`benchmark.md` is a human-readable rendering of the same data.

---

## feedback.json

Written by the reviewer when the human clicks "Submit All Reviews". Copy the
downloaded file into the iteration directory so the next round can read it.

```json
{
  "reviews": [
    { "run_id": "eval-0-with_skill", "feedback": "the chart is missing axis labels", "timestamp": "2026-10-06T08:40:00Z" },
    { "run_id": "eval-1-with_skill", "feedback": "", "timestamp": "2026-10-06T08:41:00Z" }
  ],
  "status": "complete"
}
```

- `run_id` — must match [the run id convention](#run-ids-and-configuration-names),
  otherwise the viewer can't attach the comment to the right panel.
- An **empty `feedback` string means the human looked at it and was happy.** It
  does not mean "skipped". Focus revision on the runs that carry complaints.
- `status` is `complete` when the human finished, `in_progress` while editing.

---

## Trigger eval set

Used only by the description optimizer (`scripts/run_loop.py`), not by the task
evals above. Twenty queries, roughly half should trigger the skill.

```json
[
  { "query": "the user prompt", "should_trigger": true },
  { "query": "another prompt", "should_trigger": false }
]
```

`should_trigger` is a real boolean here, not a string. The loop splits these 60/40
into train and test and never reports a score without both.

---

## Advice for writing these files

- **Prefer scripts over eyeballing** for any assertion that can be checked
  mechanically. A script is reproducible across iterations; a glance is not, and
  a stale glance is worse than no check.
- **Keep `evidence` concrete.** "passed" alone tells the human nothing when they
  are scanning twenty rows. Quote the number, the filename, or the missing thing.
- **Write `timing.json` immediately.** See the note in that section — this is the
  one piece of data with no second chance.
- **Don't invent fields.** Extra keys are ignored by the tools but they mislead
  whoever reads the JSON next. If something genuinely new is needed, add it here
  first so the contract stays in one place.
