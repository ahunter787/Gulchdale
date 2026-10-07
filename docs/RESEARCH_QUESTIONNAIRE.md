# Gulchdale research questionnaire

Owner-research ticket: **GD-300-902**. Workbench implementation: **GD-300-003**.
Status: Q01–Q03 reviewed and answered; Q07/Q09/Q11/Q12 partially informed by the
reviewed discussion. Q04/Q05/Q06/Q08/Q10 remain Not supplied. No candidate list,
numeric weighting profile or playable Expedition has been approved.

Review source: direct owner messages in this chat, incorporated on 2026-10-06.
The owner reports the same Q01–Q03 answers in Plane. At review time the exact
GD-300-902 v1 comments endpoint returned zero comments; no comment ID is invented.
This explicit review request authorizes transfer of the supplied chat answers.

Read this page in Outline, then answer numbered questions in GD-300-902's Plane
comments. Answers may arrive incrementally. Include the question number, proposed
answer, supporting evidence and whether it is research or a requested decision.
Do not edit the synchronized Outline page body: publication can overwrite it.
Comments remain intact. After an explicit review request, the harness transfers
reviewed answers into repository Markdown, preserving their provenance.

The [workbench guide](RESEARCH_WORKBENCH.md) describes tools that can be built and
used before this research is finished. Unanswered fields do not authorize invented
values. Missing experimental inputs block that experiment, not catalog inspection.

## Adopted boundaries — do not reopen implicitly

The new game uses immediate shared/private packs, exactly four/eight seats,
per-player singleton, approved category supply, holds before presentation and
explicit decline/burn behavior. Missing affinity is neutral 0.5; human annotations
take precedence. Legacy UI is not a design reference. See [ADR-0009](decisions/ADR-0009-new-game-and-integration-boundaries.md).

Research targets and experimental parameters are not production constants.
Phase 2 stays Building until real content/balance review passes. Full-cube tagging,
live promotion, Defector rules and a production cutover remain outside this work.

[ADR-0010](decisions/ADR-0010-experience-policy-and-commander-packages.md) records
the reviewed lobby, curation and exclusive commander-package boundaries.
The owner's [Gulchdale Philosophy](http://10.60.0.227:8105/doc/gulchdale-philosophy-wmw1L6OyZZ)
is marketing/player-experience and curation intent, not an executable specification.
The handwritten Game Design and Balance collection is protected and never modified
by this workflow. Strong guidance is not a promise of a fully coherent deck.

## Q01 — Audience

Who is the first experience for, and what complexity should it accommodate?

- Answer: Relative beginners through veteran players; not a beginner teaching tool and not a professional-player environment.
- Evidence: Owner's Q01 answer in this chat; expressly reviewed for incorporation. The philosophy supplies supporting experience intent, not measured player evidence.
- Status: Answered and reviewed; experience intent adopted, not an automatic player-skill classifier.
- Related gate: GD-300-902; initial content/complexity review.

## Q02 — Experience

What should games feel like, and which frustrating play patterns should review flag?

- Answer: Cube-list issue indicators are a deck unable to reach 36 spells after deckbuilding, a two-color mana base unable to support its colors, and draft offers failing to provide a meaningful mana curve whose peak is around 2–3 mana. A player may pick a poor curve despite adequate opportunities; distinguish that from a deficient list. These are curation indicators, not system defects or new weighting, forced-pick, live-correction or deck-legality rules.
- Evidence: Owner's Q02 answer in this chat; expressly reviewed. Actual slice/playtest measurements are not yet supplied.
- Status: Answered and reviewed as experience intent. Operational counting and measurement questions remain R03; no pass/fail implementation or curve/fixing weighting is approved.
- Related gate: GD-300-902; content review and playtest criteria.

## Q03 — Accessibility

What budget, availability or other card-selection constraints should guide research?
Budget goals are notes here; current pricing, substitutions and shopping remain Phase 10.

- Answer: Early versions have a soft $1,000 all-in target; budget is not a failed-list criterion. Actual early cost could exceed $5,000. The owner estimates existing Gulchdale at $5,000–$12,000. Practical current supply is the owned collection plus a few small purchases. Future public deployment has a hard $1,000 ceiling and preferably a lower target; that ceiling is not hard for current research.
- Evidence: Owner's Q03 answer in this chat; these are estimates and goals, not current price snapshots or verified collection valuations.
- Status: Answered and reviewed; budget scope remains R04. No price optimization or shopping implementation is approved.
- Related gate: GD-300-902; accessibility review, later GD-900 buildability.

## Q04 — First slice

Which approximately 20 commanders and 100 cards should form the initial bounded
collection? Supply exact candidate names or a CSV; this is not a request to tag the full cube.

- Answer: Not supplied.
- Evidence: Not supplied.
- Status: Open owner research; no candidate slice approved.
- Related gate: GD-300-902; remaining Phase 2 real-content exit gate.

## Q05 — Archetypes

Which 5–8 archetypes should be studied, and what distinguishes their plans?
Identify enablers, payoffs and overlaps rather than assigning scores to the entire pool.

- Answer: Not supplied.
- Evidence: Not supplied.
- Status: Open owner research; no archetype list/capacity adopted.
- Related gate: GD-300-902; small-slice support and balance review.

## Q06 — Tribes

Which tribes and support relationships deserve initial attention? Distinguish a
printed creature type from a curated support package or proposed group membership.

- Answer: Not supplied.
- Evidence: Not supplied.
- Status: Open owner research; no tribe/support list adopted.
- Related gate: GD-300-902; tribal coverage and scarcity experiments.

## Q07 — Commanders

What commander characteristics warrant inclusion, exclusion or complexity review?
Describe color demands, play patterns and pilot difficulty. Command-zone placement
and deck counting remain GD-500-901, not answers inferred from this question.

- Answer: Partial. Beginner and Intermediate lobby commander pools exclude three-color commanders. Personal experience recommends a lobby rather than prohibiting a willing higher-difficulty join. Commander signatures/support are exclusive curated packages, not ordinary pack candidates. Exact launch roster, complexity reviews and higher-color treatment are not supplied.
- Evidence: Reviewed owner discussion recorded in ADR-0010; no candidate roster or pilot-complexity study supplied.
- Status: Partially answered; commander curation remains open, with lobby setup in R01 and signature legality in R05/R06.
- Related gate: GD-300-902; commander review; separate GD-500-901 legality gate.

## Q08 — Roles

What fixing, ramp, draw, removal, enabler and payoff targets should experiments
investigate? Specify whether targets apply to a collection or a player outcome;
leave unknown quantities open rather than presenting them as accepted minimums.

- Answer: Not supplied.
- Evidence: Not supplied.
- Status: Open owner research; targets not specified.
- Related gate: GD-300-902; collection coverage and experimental evidence.

## Q09 — Supply classification

Which candidate cards belong to each already-approved supply category: commander,
commander-support, Main Deck, utility land, tribal or personal commander staple?
Each card has one policy regardless of overlapping tribe/archetype memberships.

- Answer: Partial. Signatures and support belong exclusively to one commander, are granted on selecting it and cannot occur in any other independently draftable pool. The legacy spawnedByDraftEffect tag and commander Notes demonstrate the relationship; modern data needs explicit typed ownership rather than executable free-form Notes. Other real candidate classifications remain Not supplied.
- Evidence: Owner's package clarification; inspected Cube Cobra and committed legacy Atla/Thornbite Staff and Baba/Crop Rotation examples, summarized in ADR-0010.
- Status: Partially answered; exclusive package direction adopted, candidate mapping and package schema/accounting proof not implemented.
- Related gate: GD-300-902; experiment readiness; existing GD-300-901 policy is settled.

## Q10 — Affinity evidence

Which card/archetype relationships should receive initial annotations, and why?
Start with a few evidence-backed relationships. Unknown affinity stays neutral;
no full-cube scoring or automatic power/salt/difficulty labeling is requested.

- Answer: Not supplied.
- Evidence: Not supplied.
- Status: Open owner research; no annotation set approved.
- Related gate: GD-300-902; research scoring and later calibration.

## Q11 — Experiments

What pack sizes, retained counts, color permissions, signals and resource/action
sequences should each named hypothesis test? Specify initial boosters, grants,
declines, burns and any explicit retries. Both modeled selection policies run with
matched initial inputs; later offers may diverge. Profiles do not define playable Expeditions.

- Answer: Partial. Research should distinguish lobby commander content from personal Adornment eligibility, and strong tribe/commander guidance from curated mana-curve/role coverage. Historical passing language has no backend governance. Defection remains experimental. No pack sizes, retained counts, coefficients, action sequences or real-card profiles are supplied.
- Evidence: Reviewed owner discussion recorded in ADR-0010; no executable experimental profile supplied.
- Status: Partially answered; actual named profiles remain open. Do not add curve/fixing corrective weighting or infer numeric guidance constants.
- Related gate: GD-300-902; explicit-profile readiness; separate GD-400-901 content gate.

## Q12 — Acceptance

What evidence would make a candidate slice ready for playtesting, and what findings
require revision? Distinguish data completeness and accounting safety from actual
game enjoyment, support quality and real-player evidence.

- Answer: Partial. Flag inadequate support and supply failures, retain the paths that led to them and use the evidence for cube curation. Do not manufacture supply or take new automatic corrective action during a draft. Q02 gives player-experience indicators, not an implemented legality gate. Existing explicit tribal replacement rules are not silently repealed.
- Evidence: Reviewed owner discussion and Q02; no real-card outcome evidence or complete acceptance rubric supplied.
- Status: Partially answered; measurement/attribution remains R03 and the relation to existing replacements remains R08. Real-content/balance acceptance is still open.
- Related gate: GD-300-902; Phase 2 real-content exit and later playtesting.

## Follow-up questions from the reviewed discussion

Answer these in the indicated existing Plane ticket, using the R number. No new
ticket is needed merely to expose the remaining questions.

### R01 — Lobby configuration and experience input

Who selects the lobby mode: host, vote or another mechanism? How is personal
experience supplied for recommendations and Adornments before persistent learning
exists? Which actual commander rosters are available per mode, and are commanders
with more than three colors excluded from Veteran too?

- Answer: Not supplied.
- Evidence: Lobby choice overrides personal recommendations; three-color commanders are excluded from Beginner/Intermediate. These settled choices are not reopened.
- Status: Open configuration/content details; no automatic lobby averaging approved.
- Related gate: GD-300-902 for rosters/experiments; GD-400-901 for session setup; GD-800-901 for later learned experience.

### R02 — Personal Adornment permissions

What color-expansion limits apply at each personal level, including a beginner who
willingly joins a Veteran lobby? How are those permissions represented and combined
with commander/signature colors?

- Answer: Not supplied beyond personal-level ownership of eligibility.
- Evidence: Reviewed owner Adornment clarification; lobby difficulty alone does not redefine personal eligibility.
- Status: Open exact limits and representation.
- Related gate: GD-400-901; GD-500-901.

### R03 — Measurable curation indicators

What counts toward 36 spells: commander, signature, support, modal cards? Does 36
describe selected spells or the available buildable pool? How should two-color mana
support and a meaningful offered curve be measured, and how do we attribute a failure
to missing opportunities rather than the player's selections? These are review
criteria, not requested weighting or live deck repair.

- Answer: Not supplied beyond the reviewed experience goals in Q02.
- Evidence: Owner explicitly distinguishes list quality from player choice and system behavior.
- Status: Open counting, measurement and attribution; no new hard legality check.
- Related gate: GD-300-902; GD-500-901 only for deck counting; later GD-700 diagnostics.

### R04 — All-in budget and owned-card baseline

Does the future $1,000 ceiling cover one complete four/eight-seat physical supply,
basic lands, package attachments, shipping and accessories? Are owned cards valued
at replacement price or excluded as sunk cost? What collection inventory and small
purchase allowance should current candidate research use?

- Answer: Not supplied beyond Q03's soft early target and hard future public ceiling.
- Evidence: Q03 is budget intent; no inventory or price snapshot supplied.
- Status: Open accounting scope; not a blocker imposed on current list research.
- Related gate: GD-300-902 for current availability; GD-900 Phase 10 buildability.

### R05 — Retained packages, leader and command zone

Which retained commander's signature may start in the command zone: only the marked
leader's, or another expressly permitted arrangement? Where do the other commanders
and their earned attachments live? Can changing leader change signature designation,
and what color permissions apply? Does each included support card count normally
toward 60? The arbitrary-spell conversion mechanism is already excluded from
current scope; signatures are hand-curated, not chosen mid-draft.

- Answer: Not supplied for these details. The deck's commander and optional signature already count as cards 1 and 2; signatures follow ordinary zones after casting.
- Evidence: Reviewed owner signature rules in ADR-0010.
- Status: Open legality/placement; ownership alone does not grant command-zone permission.
- Related gate: GD-500-901.

### R06 — Package data and slice scope

Supply the initial commander-to-signature/support mappings, distinguishing each
signature from ordinary support. The owner prefers signatures in the first slice
if the bounded package/recovery/export gate can pass; which mappings demonstrate it?
Record explicit deferral if that technical gate cannot be met. Do not re-ask whether
attachments should overlap other pools: their exclusivity is settled.

- Answer: Real initial mapping set Not supplied; Atla/Thornbite Staff and Baba/Crop Rotation plus four utility lands are reviewed historical examples, not automatic new-slice approval.
- Evidence: Reviewed owner package and conditional first-slice direction.
- Status: Open content mappings and pending technical gate; no broad Phase 9 pull-forward.
- Related gate: GD-300-902; GD-500-901 legality; Phase 2/3/4 package proof boundaries in ADR-0010.

### R07 — Curation evidence for the shared substrate

Which initial role overlaps, tribes and commander needs should guide the bounded
slice? What examples establish high synergistic versus excessive generic ceiling,
without introducing automated power ratings or a commander-specific archetype for
every unusual commander?

- Answer: Not supplied as a reviewed candidate/annotation set.
- Evidence: Owner-authored philosophy is a curation input, not technical constants.
- Status: Open; fills Q04–Q06/Q08/Q10 rather than approving the whole cube.
- Related gate: GD-300-902.

### R08 — Failure flags versus existing replacement offers

Does "no direct action during draft" mean no new corrective action for curation
failures (leaving ADR-0009's explicit tribal replacements intact), or should those
already-approved replacements change? Until answered, existing replacement rules
remain adopted; no automatic rescue/reroll/supply creation is added.

- Answer: Not supplied for the interaction with older replacement rules.
- Evidence: Owner's diagnostic-only instruction and the existing approved replacement policy have different scopes.
- Status: Open clarification; no silent repeal or expansion.
- Related gate: GD-300-902; GD-300-901 only if the owner requests a supply-policy amendment.

## Other owner gates

Expedition scripts, pacing, rewards and Adornment permissions remain **GD-400-901**.
Commander placement, deck counting and Adornment/export representation remain
**GD-500-901**. Identity/privacy remains **GD-800-901**. Their unanswered questions
are preserved in the [work-item catalog](WORK_ITEMS.md) and [decision record](decisions/ADR-0007-open-game-rules.md).
Research answers do not silently approve any of these rules.
