# Autonomous loop — kick-off prompt

**Riley:** Paste the contents of the code block below into a fresh Claude Code session inside `/tmp/polyphonic-v2/`. The session will then execute the entire LUCA_PLAN autonomously, committing and pushing per phase, until everything is `[x]` or it's stuck on 3+ blockers.

You should see commits arriving in the repo every 10–60 minutes during execution. If anything looks wrong, you can interrupt at any time — the next session will pick up cleanly from the last `[ ]` in `LUCA_PLAN.md`.

---

## The prompt

```
You are continuing the Luca Terminal integration into polyphonic-v2.
This is autonomous execution mode — work through every unfinished
phase end-to-end without pinging me until you are completely done
or genuinely stuck.

START SEQUENCE:
1. Read CLAUDE.md fully. It is your operating protocol.
2. Read LUCA_PLAN.md. It is the master phase index with status.
3. Confirm the working environment per CLAUDE.md "Session start
   sequence":
   a. cd /tmp/polyphonic-v2 && git pull --rebase origin main
   b. Verify dev server on 8082 (start if not).
   c. Verify mockup server on 9000 (start if not).

EXECUTION LOOP:
Repeat until a stop condition fires:

  1. Find the first `[ ]` phase in LUCA_PLAN.md that is NOT
     blocked by a `[B]` upstream dependency.
  2. Read its spec doc under design-system/<NN>-<name>.md fully.
  3. Mark the phase `[~]` in LUCA_PLAN.md.
  4. Execute every task in the spec, in order, applying CLAUDE.md
     decision rules whenever ambiguity arises.
  5. Run all verification gates per CLAUDE.md.
  6. If verification passes:
     - Commit per CLAUDE.md commit discipline.
     - Push to origin/main.
     - Mark the phase `[x]` in LUCA_PLAN.md, commit + push that
       update with message `plan: phase NN complete`.
  7. If verification fails:
     - Fix in same commit. Never ship broken.
     - If 3rd consecutive failure on same phase, mark `[!]`,
       add to Open questions, move to next phase.
  8. If a phase requires Lovable backend work:
     - Mark `[B]`, surface the prompt under "Backend asks queue"
       in LUCA_PLAN.md.
     - Move to next non-blocked phase. Don't wait.

STOP CONDITIONS:
  A. All phases `[x]` (complete success).
  B. 3+ phases in `[B]` state with no Lovable response in this
     session — pause and write end-of-run summary noting backend
     queue is the gating item.
  C. 3+ phases in `[!]` state — pause and write end-of-run summary
     noting open questions need Riley's input.
  D. Context approaching exhaustion (~80% used) — flush an
     end-of-run summary, commit, push, suggest restarting fresh
     session for the remaining work.

WHEN STOPPING:
  1. Write an end-of-run summary at the bottom of LUCA_PLAN.md
     under "End-of-run summary":
     - Phases completed (count + list)
     - Phases blocked (count + reasons)
     - Phases in open questions (count + summary)
     - Total commits pushed
     - Suggested next-session focus
  2. Commit + push the summary with message
     `plan: end-of-run summary — N phases complete`.
  3. Surface a short report in conversation describing what landed.

COMMUNICATION RULES:
  - Do NOT ping me mid-run. Use the Open questions + Backend asks
    queues in LUCA_PLAN.md instead.
  - Do NOT ask questions that CLAUDE.md decision rules cover.
  - Do commit and push frequently so I can observe progress via
    git log.
  - When done, give me a 5-bullet summary of what shipped + what's
    blocked + suggested next steps.

CONTEXT CONSERVATION:
  - Don't re-read mockup HTML files. The design-system/ specs are
    the interface.
  - Use Explore subagents for any pattern audit > 200 lines of
    code. Don't read large files inline.
  - Keep plan-mode out of execution. Just execute. Plan only if
    facing a true architectural decision.

Begin now. First action: read CLAUDE.md.
```

---

## Stopping autonomous mode

If you want to interrupt:
- Hit Ctrl+C / close the session
- The next session will pick up from the last `[ ]` in LUCA_PLAN.md
- Any `[~]` (in-progress) phases should be checked manually — if a commit landed for them, mark `[x]`; if not, revert to `[ ]`.

## Resuming after interruption

Just paste the same prompt in a fresh session. The loop is fully resumable — no state lives outside the repo.
