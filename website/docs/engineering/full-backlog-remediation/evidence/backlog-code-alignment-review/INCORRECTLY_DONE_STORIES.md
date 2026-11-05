# Incorrectly Done stories — partial findings

**INCOMPLETE — interrupted by external removal of the acceptance registry and historical audit evidence. No owner acceptance or GitHub synchronization is asserted.**

Freshly supported review recommendations:

- #45: E04-03.C3 — “Convert reservation to accepted commitment atomically within capacity.” The acceptance path calls requireCurrentEligibility with the offer quantity after projectCapacity already includes its reservation. A fully reserved valid offer is rejected. P1 remediation priority.
- #47: E05-01.C2 — “Filter craft, equipment, declared availability and free capacity.” Guard checks skills.length rather than the requested craft; a native PostgreSQL counterexample returns no denials for an unrelated retained craft. P2. Equipment is not reread by this helper either; no separate equipment exploit is claimed.
- #118: E05-07.C4 — “Keep hard capacity/qualification/consent guards active.” The requested-craft counterexample leaves the qualification guard incomplete. P2.

The complete historical40 identities recovered before loss are:

#35, #36, #37, #40, #44, #47, #48, #51, #53, #55, #56, #57, #58, #60, #61, #62, #63, #66, #72, #73, #78, #84, #85, #87, #88, #102, #113, #118, #119, #124, #126, #134, #135, #136, #139, #142, #143, #176, #190, #204.

The request's37 omitted #44, #84 and #85. Historical identities are not a current failure verdict. G27/#102, pause/#113, custody/#135 and stage reachability/#204 have fresh corrective evidence; they must not be automatically carried forward as failures. Current whole-story counts remain undetermined.
