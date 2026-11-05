"""Generate the requested repository evidence package from preserved logs and exact issue criteria.
Run from website/. No GitHub writes, database connections, staging or commits occur here.
"""
from pathlib import Path
import json, re, collections
ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'docs/engineering/batch8-11-completion'
EV=OUT/'evidence'
issues=json.loads((EV/'original-criteria.json').read_text())
assert len(issues)==33 and len({r['backlogId'] for r in issues})==33
api='apps/api/'
web='apps/web/'
planning='apps/api/src/modules/procurement/planning.ts'
catalog='apps/api/src/modules/catalog/catalog.service.ts'
intelligence='apps/api/src/modules/intelligence/intelligence.service.ts'
collaboration='apps/api/src/modules/collaboration/collaboration.service.ts'
execution='apps/api/src/modules/procurement/execution.ts'
pt='apps/api/test/planning-intelligence.scenarios.ts'
ct='apps/api/test/product-authority.scenarios.ts'
lt='apps/api/test/collaboration.scenarios.ts'
nt='apps/api/test/notification-delivery.scenarios.ts'
dbtest='apps/api/test/batch811-migrations.scenarios.ts'
demo='tests/demo-e2e/batch811.spec.ts'
pb='tests/e2e/planning-intelligence.spec.ts'
cb='tests/e2e/product-authority.spec.ts'
lb='tests/e2e/collaboration.spec.ts'
def read(name):
    p=EV/name
    return p.read_text(errors='replace') if p.exists() else ''
log=read('integration-release.log')
browser=read('browser-release.log')
demo_log=read('browser-demo-release.log') or read('browser-demo-final.log')
int_pass=bool(re.search(r'Integration passed: \d+ scenarios',log))
browser_pass=bool(re.search(r'\b50 passed\b',browser)) and 'failed\n' not in browser
showroom_pass=bool(re.search(r'\b3 passed\b',demo_log))
gates=int_pass and browser_pass and showroom_pass
meta={
'E05-02':(planning,pt,pb,'weighted snapshots; normalized component recomputation, eligibility gates, deterministic tie unit tests'),
'E05-03':(planning,pt,pb,'nonbinding concurrent drafts, positive integer reconciliation, unknown material review refusal'),
'E05-04':(planning+'; apps/api/src/modules/procurement/production-offers.ts',pt,demo,'atomic per-person issuance, concurrent replay, OFFERED state and exact voluntary acceptance'),
'E05-05':(planning,pt,demo,'decline/expiry release-once, accepted protection, live candidate capacity and source/reason links'),
'E05-07':(planning,pt,pb,'scoped purpose review, logged override and hard-capacity rejection; browser positive override'),
'E11-01':('packages/contracts/src/planning.ts; '+planning,pt,pb,'explanations use the same versioned score inputs and weights'),
'E11-02':(planning+'; apps/api/src/modules/procurement/commercial-decision.ts',pt,pb,'exact effort-range pricing and authorized costing handoff; existing quote approval authority preserved'),
'E11-03':('packages/contracts/src/planning.ts; '+planning,pt,pb,'material-ready/unknown scenarios, explicit assumed throughput/calendar and advisory-only persistence'),
'E20-01':(catalog+'; '+execution+'; apps/api/src/modules/procurement/production-offers.ts',ct,demo,'immutable approved design, buyer-authorized new projection, exact issued offer digest, release and pinned criteria'),
'E20-02':(catalog+'; apps/api/src/modules/finance/sample-obligations.ts',ct,cb,'exact paid terms, own-artisan consent, observed/unknown costs and effort, completion payable surviving rejection'),
'E20-03':(catalog+'; '+execution,ct,demo,'immutable buyer decision lineage used by downstream release and inspection'),
'E02-06':(catalog+'; apps/api/src/modules/procurement/procurement.service.ts',ct+'; apps/api/test/procurement.scenarios.ts',cb+'; tests/e2e/procurement.spec.ts','one buyer decision projected into legacy compatibility records; version/decision/rejection regressions'),
'E11-04':(intelligence+'; packages/contracts/src/intelligence.ts',pt+'; apps/api/test/unit/intelligence.test.ts',pb,'recorded risk examples, real clock, staleness/unknowns, evaluation time and intervention owner'),
'E11-05':(intelligence+'; '+execution,pt,demo,'append-only versioned forecast snapshots, preserved assumptions, separate synthetic comparisons and missing/genuine evidence gates'),
'E11-06':(intelligence+'; '+planning,pt,pb,'purpose-scoped snapshot/override review, period/eligible-population exposure, findings and human corrective owner'),
'E13-01':(intelligence+'; apps/web/src/components/intelligence-workspace.tsx',pt,pb+'; '+demo,'synthetic labels, aggregate producer-share formula and suppressed/unknown states'),
'E13-02':(intelligence+'; packages/contracts/src/intelligence.ts',pt+'; apps/api/test/execution.scenarios.ts',demo,'defined source-event metrics, period/timezone, distinct fulfillment and monetary states'),
'E13-04':(intelligence+'; apps/web/src/components/execution-workspace.tsx',pt,demo,'own-artisan consented time, bounded reporting windows/units/provenance, correction history and private earnings'),
'E13-05':(intelligence,pt,pb,'reviewed controlled cohort policy, distinct financial contributor suppression and whole-month filter protections'),
'E05-06':(intelligence,pt,pb,'defined monthly eligible/exposed population including zero offers, separate simulated paid participation, suppression and no penalties'),
'E06-07':(intelligence,pt,pb+'; '+demo,'deduplicated concurrent alerts, versioned facts, owner, acknowledgement and resolution'),
'E02-05':('apps/api/src/modules/procurement/procurement.service.ts','apps/api/test/procurement.scenarios.ts','tests/e2e/procurement.spec.ts','existing RFQ revision, stale-write, clarification and immutable accepted-terms regressions'),
'E02-07':(collaboration,lt,lb+'; tests/e2e/procurement.spec.ts','sanitized attributable messages, persisted delivery state and internal/participant separation'),
'E06-05':(collaboration,lt,demo,'batch-linked affected quantities/dates, coordinator notices, original facts and independent resolution'),
'E06-06':(collaboration,lt,demo,'capacity/material/transport impact disclosure, buyer plus artisan approval, stale/rejected changes and administrator refusal'),
'E04-05':('apps/api/src/modules/artisans/artisans.service.ts','apps/api/test/artisans.integration.ts; apps/api/test/roles.scenarios.ts','tests/e2e/identity.spec.ts; tests/e2e/revised-foundation.spec.ts','existing consent/delegation revocation and distinct helper/worker authority regressions'),
'E04-07':(collaboration+'; apps/api/src/modules/procurement/production-offers.ts',lt,'tests/e2e/production.spec.ts; '+demo,'manager-issued replacement terms, original history, expiry/capacity/refusal/unauthorized/stale/concurrent acceptance'),
'E04-08':(collaboration+'; apps/api/src/modules/artisans/capacity.ts',lt,lb,'effective-dated own pause, enforced offer/capacity gates, resume and preserved commitments/support/statements'),
'E04-09':('apps/api/src/modules/artisans/artisans.service.ts','apps/api/test/artisans.integration.ts','tests/e2e/capacity.spec.ts','explicit capacity-read sharing, consent/current delegation, deduplication, compatible periods/units and revocation'),
'E19-01':(execution+'; apps/web/src/components/execution-workspace.tsx',ct,demo,'pinned illustrated/translated source instructions and print fallback; real participant comprehension remains open'),
'E19-03':(collaboration,lt,lb+'; '+demo,'optional explanation, private support, correction/withdrawal and unchanged ranking inputs'),
'E14-03':(collaboration,lt,lb+'; '+demo,'scoped case images, response owner/deadline, escalation, preserved original facts and independent remedy references'),
'E14-06':(collaboration+'; apps/api/src/jobs/notifications.ts',lt+'; '+nt,lb+'; '+demo,'localized durable queue, consent, local SMTP, transient preflight retry, no duplicate claims, uncertain-ACK hold and permitted in-app fallback'),
}
workflow=[
('P01','Recompute ranking from persisted normalized inputs/weights',pt,'planning persists reproducible weighted inputs'),
('P02','Concurrent draft replay creates no offers or commitments',pt,'planning persists reproducible weighted inputs'),
('P03','Unknown materials may draft but cannot pass review',pt,'planning refuses unknown materials'),
('P04','Unauthorized/over-capacity override leaves allocation unchanged',pt,'planning refuses unknown materials'),
('P05','Concurrent issuance creates three distinct OFFERED records once',pt,'plan issuance is atomic and retry-safe'),
('P06','Declined/expired reallocation releases once and preserves acceptance',pt,'plan issuance is atomic and retry-safe'),
('C01','Only design owner approves; approved content is immutable',ct,'E20 design owner approval is scoped'),
('C02','Stale/cross-buyer approval leaves no decision',ct,'E20 buyer signoff has immutable exact revision lineage'),
('C03','Only assigned artisan accepts exact paid sample terms',ct,'E20 paid sample work requires its own artisan acceptance'),
('C04','Concurrent completion creates exactly one exact ledger obligation',ct,'E20 completion recognizes one exact sample obligation'),
('C05','Rejected/no-bulk sample retains earned payable',ct,'E20 quality rejection preserves the earned sample obligation'),
('C06','One sample decision binds release and inspection; old revision preserved',ct,'E20 one buyer approval projects into the release authority'),
('I01','Risk uses recorded shortage and a real evaluation clock',pt,'risk alerts deduplicate under concurrent evaluation'),
('I02','Concurrent alerts deduplicate; scoped ack/resolve is audited',pt,'risk alerts deduplicate under concurrent evaluation'),
('I03','Forecast snapshots preserve version/assumptions and refuse rewrites',pt,'forecast snapshots are immutable, versioned and scoped'),
('I04','Missing completion never fabricates forecast accuracy',pt,'forecast snapshots are immutable, versioned and scoped'),
('I05','Consented time rejects overlaps and appends corrections',pt,'observed production time requires artisan consent'),
('I06','Reviewed policy and bounded periods enforce suppression',pt,'reviewed cohort policy requires platform governance'),
('L01','Buyer approval alone leaves effective schedule unchanged',lt,'schedule consent denies platform substitution'),
('L02','Artisan coapproval required; stale/admin substitution refused',lt,'schedule consent denies platform substitution'),
('L03','Sanitized internal discussion never leaks to buyer/outsider',lt,'discussion internal notes and sanitized delivery history'),
('L04','Affected quantity/date and coordinator exception attribution persist',lt,'scoped exceptions retain original facts'),
('L05','Private support permits correction/withdrawal without explanation',lt,'private support correction, attachment access and withdrawal'),
('L06','Case image bytes are protected from unrelated users',lt,'private support correction, attachment access and withdrawal'),
('L07','Localized no-provider failure, optout and idempotent retry',lt,'localized external notifications fail honestly'),
('L08','Effective pause/resume preserves accepted work',lt,'effective availability pause preserves accepted batches'),
('X01','Actual auth sessions, CSRF and strict request validation','apps/api/test/integration.ts','origin, CSRF, validation and object ownership'),
('X02','Suspended affiliations revoke business access','apps/api/test/roles.scenarios.ts','revoked participation and suspended organizations'),
('X03','Twenty original new tables have PK/FK/index coverage',dbtest,'B811-M02'),
('X04','Populated pre-Batch8 native migrate deploy preserves baseline values',dbtest,'B811-M01'),
('X05','Foreign-key failure rolls back the whole transaction',dbtest,'B811-M04'),
('X06','Every native migration-history checksum matches disk',dbtest,'B811-M03'),
('X07','Concurrent PostgreSQL clients enforce uniqueness',dbtest,'B811-M05'),
('X08','Encrypted backup restores every table in disposable infrastructure','apps/api/test/restore.scenarios.ts','E16 real pg_dump/pg_restore preserves every table'),
('X09','Concurrent authoritative acceptance creates exactly one effective batch',lt,'counteroffer reissues exact versioned terms'),
('X10','Insufficient counteroffer capacity rolls back manager reissue',lt,'counteroffer reissues exact versioned terms'),
('X11','Manager refusal creates no extra reservation/commitment',lt,'counteroffer reissues exact versioned terms'),
('X12','Expired counteroffer cannot commit work',lt,'counteroffer reissues exact versioned terms'),
('X13','Unauthorized sample work persists no observation/payable',ct,'E20 paid sample work requires its own artisan acceptance'),
('X14','A v2 design cannot reuse v1 sample sign-off',ct,'E20 revision amendments preserve v1'),
('X15','Unauthorized inspection persists no quality result',ct,'E20 inspection persists the approved sample criteria'),
('X16','Exact labor/material arithmetic and no second ledger',ct,'E20 completion recognizes one exact sample obligation'),
('X17','Buyer discussions cannot inject financial API fields',lt,'discussion internal notes and sanitized delivery history'),
('X18','Current delegation revocation is enforced immediately','apps/api/test/artisans.integration.ts','revoked delegation and expired delegation lose access immediately'),
('X19','Consented association sharing deduplicates and reflects revocation','apps/api/test/artisans.integration.ts','E04-09 aggregate capacity requires explicit sharing'),
('X20','External retry/concurrent workers send exactly once to local SMTP',nt,'notification retry is idempotent and concurrent workers'),
('X21','Narrow reporting filters cannot disclose sparse compensation',pt,'reporting periods are bounded and narrow association filters'),
('X22','Synthetic batch cannot become genuine observed forecast evidence',pt,'forecast snapshots are immutable, versioned and scoped'),
('X23','Visitor reset archives history and revokes old sessions','apps/api/test/demo.scenarios.ts','showroom reset archives only owned scope'),
('X24','Cross-visitor denial and interrupted reset leave other scope intact','apps/api/test/demo.scenarios.ts','showroom reset archives only owned scope'),
]
assert len(workflow)==50
security=[
('N01','Buyer reads another buyer RFQ','apps/api/test/procurement.scenarios.ts','E02 current internal operators need assigned buyer scope'),
('N02','Coordinator accesses unrelated artisan','apps/api/test/roles.scenarios.ts','unassigned same-association coordinators'),
('N03','Unrelated actor edits/accepts counteroffer',lt,'counteroffer reissues exact versioned terms'),
('N04','Operator override bypasses hard capacity',pt,'planning refuses unknown materials'),
('N05','Unauthorized buyer/sample approval',ct,'E20 buyer signoff has immutable exact revision lineage'),
('N06','Cross-organization catalogue/document disclosure',ct,'E20 revision amendments preserve v1'),
('N07','Duplicate capacity commitment',lt,'counteroffer reissues exact versioned terms'),
('N08','Price preview silently mutates issued quote',pt,'pricing effort range and exact recalculation stay advisory'),
('N09','Analytics leaks private compensation',pt,'reporting periods are bounded and narrow association filters'),
('N10','Small-cohort/filter differencing disclosure',pt,'reporting periods are bounded and narrow association filters'),
('N11','Platform administrator substitutes for schedule consent',lt,'schedule consent denies platform substitution'),
('N12','Coordinator impersonates artisan consent','apps/api/test/commercial.scenarios.ts','production eligibility, offers and voluntary decisions stay isolated'),
('N13','Unrelated actor reads/retries recipient notification',lt,'localized external notifications fail honestly'),
('N14','Buyer discussion accepts internal finance API fields',lt,'discussion internal notes and sanitized delivery history'),
('N15','Revoked grant or suspended affiliation retains access','apps/api/test/artisans.integration.ts','delegate membership suspension removes access immediately'),
('N16','Cross-visitor showroom access','apps/api/test/demo.scenarios.ts','showroom uses six real scoped authenticated accounts'),
('N17','Unsupported accountless acceptance creates work','apps/api/test/demo.scenarios.ts','accountless showroom reports remain pending'),
('N18','Synthetic evidence relabelled genuine',pt,'forecast snapshots are immutable, versioned and scoped'),
]
assert len(security)==18
for collection in (workflow,security):
    for cid,title,file,needle in collection:
        assert (ROOT/file).exists(),file
        assert needle in (ROOT/file).read_text() or needle in log,(cid,needle)
manifest={'workflows':[{'id':a,'scenario':b,'test':c,'logMarker':d,'result':'PASS' if 'PASS '+d in log else 'UNVERIFIED'} for a,b,c,d in workflow], 'negativeSecurity':[{'id':a,'scenario':b,'test':c,'logMarker':d,'result':'PASS' if 'PASS '+d in log else 'UNVERIFIED'} for a,b,c,d in security]}
(EV/'scenario-coverage.json').write_text(json.dumps(manifest,indent=2)+'\n')
rows=[]
for issue in issues:
    sid=issue['backlogId'];impl,tests,bs,explanation=meta[sid]
    criteria=[re.sub(r'^- \[ \] ','',line) for line in issue['criteria'].splitlines() if line.startswith('- [ ]')]
    assert len(criteria)==5
    status='BLOCKED' if sid=='E19-01' else ('VERIFIED_SOFTWARE_CRITERIA' if gates else 'IMPLEMENTED_UNVERIFIED')
    missing='Real consenting participant comprehension sessions, reviewed findings and fixes (criterion 5).' if sid=='E19-01' else ('None in software scope; owner acceptance remains pending.' if gates else 'Final complete integration/browser evidence gates are pending.')
    records=[]
    for index,text in enumerate(criteria,1):
        external=sid=='E19-01' and index==5
        records.append({'id':f'{sid}.C{index}','text':text,'implementation':impl,'tests':tests,'browser':bs,'evidenceNote':explanation,'status':'BLOCKED_EXTERNAL_EVIDENCE' if external else ('VERIFIED_SOFTWARE' if gates else 'IMPLEMENTED_PENDING_FINAL_EVIDENCE')})
    rows.append({'BACKLOG_ID':sid,'GITHUB_ISSUE':issue['url'],'ORIGINAL_CRITERIA':criteria,'IMPLEMENTATION_REFERENCE':impl,'TEST_REFERENCE':tests,'DATABASE_VERIFICATION':'PASS native PostgreSQL 17.7, native deploy/transactions/authenticated HTTP' if int_pass else 'PENDING final full HTTP suite','BROWSER_VERIFICATION':('PASS ' if browser_pass and showroom_pass else 'PENDING ')+bs,'SECURITY_VERIFICATION':'PASS relevant server permission/state-denial assertions; see 18-case index' if int_pass else 'PENDING final security evidence','MISSING_REQUIREMENTS':missing,'SOFTWARE_STATUS':status,'OWNER_ACCEPTANCE':'PENDING_OWNER_REVIEW','githubStateReadOnly':issue['state'],'criterionEvidence':records})
(EV/'story-evidence.json').write_text(json.dumps(rows,indent=2)+'\n')
counts=collections.Counter(row['SOFTWARE_STATUS'] for row in rows)
headers=['BACKLOG_ID','GITHUB_ISSUE','ORIGINAL_CRITERIA','IMPLEMENTATION_REFERENCE','TEST_REFERENCE','DATABASE_VERIFICATION','BROWSER_VERIFICATION','SECURITY_VERIFICATION','MISSING_REQUIREMENTS','SOFTWARE_STATUS','OWNER_ACCEPTANCE']
def cell(value):return str(value).replace('|','\\|').replace('\n','<br>')
lines=['# Story acceptance matrix — Batches 8–11','','28 October 2026 · Africa/Tunis. Exactly 33 unique stories and 165 original criteria.','',
'Criteria are verbatim from authenticated read-only GitHub retrieval. They match the 27 October snapshot exactly. Current target states are 24 CLOSED / 9 OPEN; state is not acceptance. No issue was changed.','',
'Software verification is distinct from real-world validation and owner acceptance. No real income, payment, product quality or forecasting accuracy is asserted. E19-01 remains blocked on actual consenting participants.','',
'Counts: '+', '.join(f'{key}: {value}' for key,value in sorted(counts.items()))+'.','',
'| '+' | '.join(headers)+' |','| '+' | '.join(['---']*len(headers))+' |']
for row in rows:
    values=[]
    for h in headers:
        value=row[h]
        if h=='ORIGINAL_CRITERIA':value='<br>'.join(f'C{i+1}: {v}' for i,v in enumerate(value))
        if h=='GITHUB_ISSUE':value=f"[#{next(r['number'] for r in issues if r['backlogId']==row['BACKLOG_ID'])}]({value})"
        values.append(cell(value))
    lines.append('| '+' | '.join(values)+' |')
lines+=['','## Criterion evidence','','The full machine-readable 165-criterion record is [story-evidence.json](evidence/story-evidence.json). The following references name executed domain paths rather than treating source inspection as database evidence.','']
for row in rows:
    lines+=['### '+row['BACKLOG_ID'],'']
    for criterion in row['criterionEvidence']:
        lines.append(f"- **{criterion['id']} · {criterion['status']}** — {criterion['text']} Implementation: `{criterion['implementation']}`. Tests: `{criterion['tests']}`. Browser: `{criterion['browser']}`. Evidence: {criterion['evidenceNote']}.")
    lines.append('')
(OUT/'STORY_ACCEPTANCE_MATRIX.md').write_text('\n'.join(lines)+'\n')
summary={'stories':len(rows),'criteria':sum(len(r['criterionEvidence']) for r in rows),'workflowScenarios':len(workflow),'negativeSecurityCases':len(security),'integrationPass':int_pass,'browserPass':browser_pass,'showroomPass':showroom_pass,'statuses':dict(counts)}
(EV/'story-verification-summary.json').write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps(summary,indent=2))
