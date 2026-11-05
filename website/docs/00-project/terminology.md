# Terminology

**Last verified:** 1 November 2026.

Terms used throughout NASJ documentation. Each is defined by the code that implements it.

| Term | Meaning |
|---|---|
| **RFQ** | Request for quotation. A buyer's specification and quantity request. |
| **Offer** | A voluntary artisan response to a request, with quantity and unit pay. |
| **Quote** | An operator's priced response. Accepting one exactly creates an order. |
| **Batch** | Accepted work in production for one artisan and one offer. |
| **QA** | Quality assurance. Inspections reconcile produced pieces as accepted or rejected. |
| **Payable** | A recognised obligation to an artisan, created from buyer-accepted work. Immutable once recognised. |
| **Payout request** | An instruction to pay part or all of a payable. Requires independent approval. |
| **Execution record** | An operator's report that money moved. **Not** verified payment. |
| **Simulated settlement** | A synthetic record used to exercise the settlement workflow. Never real money. |
| **Verified settlement** | A payment attested by an approved authority. **Not implemented**; the schema forbids the state. |
| **Millime** | 1/1000 of a Tunisian dinar. All money is stored as integer millimes. |
| **Shipped / reported / received** | Three distinct quantities. Shipped leaves preparation; reported is the operator's delivery report; received is the buyer's count. |
| **Unaccounted for** | Shipped minus buyer-received. Splits into an operator reporting gap and a buyer declaration. |
| **Synthetic** | Deliberately fictional data, constrained by database CHECK constraints. |
| **Provenance** | The recorded origin of a row: `SYNTHETIC`, `RECORDED`, or a named evidence source. |
| **Owner acceptance** | A human decision that a criterion is satisfied. Never inferred from code or tests. |
| **Epic / story / criterion** | Backlog levels: 21 epics, 192 stories, 963 story criteria, 63 epic gates. |
| **T5 / T6** | Verification tiers: genuine concurrency and browser journeys. Both need Docker. |
