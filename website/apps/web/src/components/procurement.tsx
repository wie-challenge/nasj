'use client';
import { useId, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import * as C from '@nasj/contracts';
import { apiFetch, ApiError } from '@/lib/api';
import {
  Workspace,
  ResourceState,
  ActionForm,
  Input,
  Select,
  useResource,
  text,
  humanize,
  useFieldError,
} from './workspace-ui';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { ProductionPanel } from './production-offers';
import { ExecutionOrder } from './execution-workspace';
import { LogisticsOrder } from './logistics-workspace';
import { BuyerOrderFeedback } from './order-feedback';
import { OrderFinance } from './finance-workspace';
const root = '/api/v1/procurement';
function useCommand() {
  const keys = useRef(new Map<string, string>());
  return async <T = unknown>(path: string, body: unknown, schema?: z.ZodType): Promise<T> => {
    if (schema) {
      const parsed = schema.safeParse(body);
      if (!parsed.success)
        throw new ApiError(400, {
          code: 'VALIDATION_ERROR',
          message: 'Check the highlighted fields.',
          fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
        });
      body = parsed.data;
    }
    const signature = JSON.stringify({ path, body });
    const key = keys.current.get(signature) ?? crypto.randomUUID();
    keys.current.set(signature, key);
    const result = await apiFetch<T>(root + path, { method: 'POST', body, idempotencyKey: key });
    keys.current.delete(signature);
    return result;
  };
}
function LongText({
  name,
  label,
  value,
  required = true,
}: {
  name: string;
  label: string;
  value?: string;
  required?: boolean;
}) {
  const id = useId(),
    errors = useFieldError(name);
  return (
    <div className="field">
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        name={name}
        defaultValue={value}
        required={required}
        rows={3}
        maxLength={2000}
        aria-invalid={errors.length ? true : undefined}
        aria-describedby={errors.length ? `${id}-error` : undefined}
      />
      {errors.length > 0 && (
        <p className="field-error" id={`${id}-error`}>
          {errors.join(' ')}
        </p>
      )}
    </div>
  );
}
function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{title}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}
function Disclosure() {
  return (
    <p className="muted">
      Synthetic demo · Samples, prices and documents are fictional. New requests require fresh
      feasibility, sample approval and exact quotation acceptance.
    </p>
  );
}
function Nav() {
  return (
    <nav aria-label="Procurement navigation" className="flex flex-wrap items-center gap-3">
      <Link href="/procurement">Requests</Link>
      <Link href="/procurement/products">Approved products</Link>
      <Link href="/procurement/documents">Documents</Link>
    </nav>
  );
}
function Pager({
  page,
  hasMore,
  setPage,
}: {
  page: number;
  hasMore: boolean;
  setPage: (n: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>
        Previous page
      </Button>
      <span>Page {page}</span>
      <Button variant="outline" disabled={!hasMore} onClick={() => setPage(page + 1)}>
        Next page
      </Button>
    </div>
  );
}
function dateValue(f: FormData, name: string) {
  const raw = text(f, name),
    date = new Date(raw);
  return Number.isNaN(date.getTime()) ? raw : date.toISOString();
}
function RequestFields({
  row,
  crafts,
}: {
  row?: C.ProcurementDetail['rfq'];
  crafts: { id: string; name: string }[];
}) {
  return (
    <>
      <Input name="title" label="Request title" value={row?.title} required />
      <Select
        name="craftSkillId"
        label="Craft"
        value={row?.craftSkillId}
        options={crafts.map((c) => ({ value: c.id, label: c.name }))}
        required
      />
      <LongText name="specification" label="Specification" value={row?.specification} />
      <LongText
        name="designRequirements"
        label="Design requirements"
        value={row?.designRequirements}
      />
      <Input
        name="quantity"
        label="Quantity in pieces"
        type="number"
        min="1"
        max="1000000"
        step="1"
        value={row?.quantity}
        required
      />
      <Input
        name="deliveryAt"
        label="Delivery deadline"
        type="datetime-local"
        value={row?.deliveryAt.slice(0, 16)}
        required
      />
      <Input
        name="deliveryLocation"
        label="Delivery destination"
        value={row?.deliveryLocation}
        required
      />
    </>
  );
}
const fields = (f: FormData) => ({
  title: text(f, 'title'),
  specification: text(f, 'specification'),
  designRequirements: text(f, 'designRequirements'),
  craftSkillId: text(f, 'craftSkillId'),
  quantity: Number(text(f, 'quantity')),
  deliveryAt: dateValue(f, 'deliveryAt'),
  deliveryLocation: text(f, 'deliveryLocation'),
});
export function ProcurementRequests() {
  const [page, setPage] = useState(1),
    resource = useResource<C.ProcurementList>(`${root}/rfqs?page=${page}`),
    send = useCommand(),
    router = useRouter(),
    data = resource.data;
  return (
    <Workspace
      title="Procurement"
      description="Prepare a request, agree the details and track each decision."
    >
      <Nav />
      <Disclosure />
      <ResourceState {...resource} retry={resource.reload} />
      {data && (
        <>
          {data.buyerOrganizations.length > 0 && (
            <details className="request-composer panel">
              <summary>Create a request</summary>
              <ActionForm
                label="Save draft"
                action={async (f) => {
                  const r = await send<{ id: string }>(
                    '/rfqs',
                    {
                      ...fields(f),
                      buyerOrganizationId: text(f, 'buyerOrganizationId'),
                      operatorOrganizationId: text(f, 'operatorOrganizationId'),
                      provenance: 'SYNTHETIC',
                    },
                    C.rfqCreateSchema,
                  );
                  router.push(`/procurement/${r.id}`);
                }}
              >
                <Select
                  name="buyerOrganizationId"
                  label="Your company"
                  options={data.buyerOrganizations.map((o) => ({ value: o.id, label: o.name }))}
                  required
                />
                <Select
                  name="operatorOrganizationId"
                  label="NASJ team"
                  options={data.operators.map((o) => ({ value: o.id, label: o.name }))}
                  required
                />
                <RequestFields crafts={data.crafts} />
              </ActionForm>
            </details>
          )}
          <Panel title="Your requests">
            {data.requests.length === 0 ? (
              <p>
                No requests are available yet. Submitted requests appear for assigned operators.
              </p>
            ) : (
              <ul className="procurement-list">
                {data.requests.map((r) => (
                  <li key={r.id}>
                    <Link href={`/procurement/${r.id}`}>{r.title}</Link>
                    <Badge variant="outline">{humanize(r.status)}</Badge>
                    {!r.procurementManaged && <span className="muted">Legacy simulation</span>}
                  </li>
                ))}
              </ul>
            )}
            <Pager page={page} hasMore={data.hasMore} setPage={setPage} />
          </Panel>
        </>
      )}
    </Workspace>
  );
}
function Attachment({
  id,
  file,
  canRemove,
  version,
  reload,
}: {
  id: string;
  file: C.ProcurementDetail['attachments'][number];
  canRemove: boolean;
  version: number;
  reload: () => unknown;
}) {
  const [preview, setPreview] = useState(''),
    [error, setError] = useState(''),
    send = useCommand();
  return (
    <li>
      <span>{file.filename}</span>
      <Button
        variant="outline"
        onClick={async () => {
          setError('');
          try {
            const { token } = await apiFetch<{ token: string }>(
              `${root}/rfqs/${id}/attachments/${file.id}/token`,
            );
            const image = await apiFetch<{ mime: string; base64: string }>(
              `${root}/rfqs/${id}/attachments/${file.id}/content?token=${encodeURIComponent(token)}`,
            );
            setPreview(`data:${image.mime};base64,${image.base64}`);
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Unable to load the image.');
          }
        }}
      >
        Preview {file.filename}
      </Button>
      {preview && (
        <Image
          unoptimized
          width={512}
          height={384}
          src={preview}
          alt={`Reference: ${file.filename}`}
          className="procurement-preview"
        />
      )}
      {error && <p role="alert">{error}</p>}
      {canRemove && (
        <ActionForm
          label={`Remove ${file.filename}`}
          action={() => send(`/rfqs/${id}/attachments/${file.id}/remove`, { version })}
          onSuccess={reload}
        />
      )}
    </li>
  );
}
function Upload({ id, version, reload }: { id: string; version: number; reload: () => unknown }) {
  const [file, setFile] = useState<File | null>(null),
    [progress, setProgress] = useState(0),
    [preview, setPreview] = useState(''),
    inputId = useId(),
    send = useCommand();
  return (
    <ActionForm
      label="Upload reference image"
      action={async () => {
        if (!file) throw new Error('Choose an image first.');
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 262144)
          throw new Error('Choose a PNG, JPEG or WebP under 256 KiB.');
        setProgress(0);
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onprogress = (e) => {
            if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 40));
          };
          reader.onerror = () => reject(new Error('Unable to read the image.'));
          reader.onload = () => resolve(String(reader.result).split(',')[1]);
          reader.readAsDataURL(file);
        });
        setProgress(50);
        try {
          await send(
            `/rfqs/${id}/attachments`,
            { version, filename: file.name, mime: file.type, base64 },
            C.procurementAttachmentSchema,
          );
          setProgress(100);
          setFile(null);
          setPreview('');
          await reload();
        } catch (e) {
          setProgress(0);
          throw e;
        }
      }}
    >
      <p>
        Up to five PNG, JPEG or WebP images, 256 KiB each. Images are inspected, resized and stored
        privately.
      </p>
      <Label htmlFor={inputId}>Reference image</Label>
      <input
        id={inputId}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(e) => {
          const chosen = e.target.files?.[0] ?? null;
          setFile(chosen);
          setPreview('');
          setProgress(0);
          if (
            chosen &&
            chosen.size <= 262144 &&
            ['image/png', 'image/jpeg', 'image/webp'].includes(chosen.type)
          ) {
            const reader = new FileReader();
            reader.onload = () => setPreview(String(reader.result));
            reader.readAsDataURL(chosen);
          }
        }}
      />
      {preview && (
        <Image
          unoptimized
          width={512}
          height={384}
          src={preview}
          alt="Selected reference"
          className="procurement-preview"
        />
      )}
      <progress aria-label="Image upload progress" value={progress} max={100} />
      <p role="status">
        {progress === 100
          ? 'Uploaded'
          : progress > 0
            ? 'Uploading image…'
            : 'Choose an image to upload.'}
      </p>
    </ActionForm>
  );
}
export function ProcurementDetail({ id }: { id: string }) {
  const resource = useResource<C.ProcurementDetail>(`${root}/rfqs/${id}`),
    options = useResource<C.ProcurementList>(`${root}/rfqs`),
    send = useCommand(),
    data = resource.data;
  return (
    <Workspace
      title={data?.rfq.title ?? 'Request details'}
      description="The specification and every decision stay linked to this request."
    >
      <Nav />
      <Disclosure />
      <ResourceState {...resource} retry={resource.reload} />
      {data &&
        (() => {
          const r = data.rfq,
            a = data.access,
            latest = data.samples[0];
          return (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <Badge variant="outline">{humanize(r.status)}</Badge>
                <span>Version {r.version}</span>
                {r.sourceProductId && <span>Reorder · new feasibility required</span>}
              </div>
              <Tabs defaultValue="details">
                <TabsList
                  className="procurement-tabs w-full flex-wrap justify-start gap-1 group-data-[orientation=horizontal]/tabs:h-auto"
                  aria-label="Request sections"
                >
                  {[
                    'details',
                    'references',
                    'activity',
                    'revisions',
                    'clarifications',
                    'samples',
                    'quotes',
                    'discussion',
                    'documents',
                    ...(data.orderId && a.operator ? ['production'] : []),
                    ...(data.orderId ? ['delivery', 'finances'] : []),
                  ].map((t) => (
                    <TabsTrigger key={t} value={t}>
                      {humanize(t)}
                    </TabsTrigger>
                  ))}
                </TabsList>
                <TabsContent value="details">
                  <Panel title="Specification">
                    <p>{r.specification}</p>
                    <p>{r.designRequirements}</p>
                    <dl>
                      <dt>Quantity</dt>
                      <dd>{r.quantity} pieces</dd>
                      <dt>Delivery deadline</dt>
                      <dd>{new Date(r.deliveryAt).toLocaleString()}</dd>
                      <dt>Destination</dt>
                      <dd>{r.deliveryLocation}</dd>
                    </dl>
                    {a.purchasing && r.status === 'DRAFT' && (
                      <ActionForm
                        label="Submit for review"
                        confirm="Submit this exact version? It will no longer be editable as a draft."
                        action={() => send(`/rfqs/${id}/submit`, { version: r.version })}
                        onSuccess={resource.reload}
                      />
                    )}
                    {a.operator && r.status === 'SUBMITTED' && (
                      <ActionForm
                        label="Start review"
                        action={() => send(`/rfqs/${id}/review`, { version: r.version })}
                        onSuccess={resource.reload}
                      />
                    )}
                    {a.purchasing &&
                      a.negotiating &&
                      !['ACCEPTED', 'DECLINED'].includes(r.status) && (
                        <details key={r.version}>
                          <summary>
                            {r.status === 'DRAFT'
                              ? 'Edit draft'
                              : 'Propose a revised specification'}
                          </summary>
                          <p>
                            A revision keeps previous terms and requires a fresh quote and sample
                            sign-off. Accepted obligations require a separate amendment.
                          </p>
                          <ActionForm
                            label="Save revision"
                            action={(f) =>
                              send(
                                `/rfqs/${id}/revisions`,
                                { ...fields(f), version: r.version, reason: text(f, 'reason') },
                                C.procurementReviseSchema,
                              )
                            }
                            onSuccess={resource.reload}
                          >
                            <RequestFields
                              row={r}
                              crafts={
                                options.data?.crafts ?? [
                                  { id: r.craftSkillId, name: r.craftSkillId },
                                ]
                              }
                            />
                            <LongText name="reason" label="Reason for revision" />
                          </ActionForm>
                        </details>
                      )}
                    {r.status === 'ACCEPTED' && (
                      <p>
                        Accepted terms are preserved. Changes require the contract amendment
                        workflow; create a separate request for a new obligation.
                      </p>
                    )}
                  </Panel>
                </TabsContent>
                <TabsContent value="references">
                  <Panel title="Reference images">
                    <ul className="procurement-list">
                      {data.attachments.map((f) => (
                        <Attachment
                          key={f.id}
                          id={id}
                          file={f}
                          canRemove={a.purchasing && r.status === 'DRAFT'}
                          version={r.version}
                          reload={resource.reload}
                        />
                      ))}
                    </ul>
                    {!data.attachments.length && <p>No reference images yet.</p>}
                    {a.purchasing && r.status === 'DRAFT' && data.attachments.length < 5 && (
                      <Upload id={id} version={r.version} reload={resource.reload} />
                    )}
                  </Panel>
                </TabsContent>
                <TabsContent value="activity">
                  <History id={id} kind="activity" />
                </TabsContent>
                <TabsContent value="revisions">
                  <History id={id} kind="revisions" />
                </TabsContent>
                <TabsContent value="clarifications">
                  <Panel title="Feasibility questions">
                    {a.operator && !['ACCEPTED', 'DECLINED'].includes(r.status) && (
                      <ActionForm
                        label="Ask a question"
                        action={(f) =>
                          send(
                            `/rfqs/${id}/questions`,
                            { question: text(f, 'question') },
                            C.procurementQuestionSchema,
                          )
                        }
                        onSuccess={resource.reload}
                      >
                        <LongText name="question" label="Question" />
                      </ActionForm>
                    )}
                    {!data.questions.length && <p>No clarification questions.</p>}
                    {data.questions.map((q) => (
                      <article key={q.id}>
                        <h3>{q.question}</h3>
                        <p>{new Date(q.createdAt).toLocaleString()}</p>
                        {q.answer ? (
                          <p>Buyer answer: {q.answer}</p>
                        ) : a.negotiating && !['ACCEPTED', 'DECLINED'].includes(r.status) ? (
                          <ActionForm
                            label="Send answer"
                            action={(f) =>
                              send(
                                `/rfqs/${id}/questions/${q.id}/answer`,
                                { answer: text(f, 'answer') },
                                C.procurementAnswerSchema,
                              )
                            }
                            onSuccess={resource.reload}
                          >
                            <LongText name="answer" label="Your answer" />
                          </ActionForm>
                        ) : (
                          <p>Awaiting buyer answer.</p>
                        )}
                      </article>
                    ))}
                  </Panel>
                </TabsContent>
                <TabsContent value="samples">
                  <Panel title="Sample review">
                    <p>
                      {data.currentSampleApproved
                        ? 'Latest sample and specification approved.'
                        : 'Full production requires approval of the latest sample and specification.'}
                    </p>
                    {a.operator && (
                      <ActionForm
                        label="Publish sample version"
                        action={(f) =>
                          send(
                            `/rfqs/${id}/samples`,
                            {
                              version: r.version,
                              evidenceReference: text(f, 'evidenceReference'),
                              criteria: text(f, 'criteria'),
                            },
                            C.procurementSampleSchema,
                          )
                        }
                        onSuccess={resource.reload}
                      >
                        <LongText name="evidenceReference" label="Sample evidence reference" />
                        <LongText name="criteria" label="Sample acceptance criteria" />
                      </ActionForm>
                    )}
                    {!data.samples.length && <p>No sample evidence has been published.</p>}
                    {data.samples.map((s) => (
                      <article key={s.id}>
                        <h3>Sample v{s.version}</h3>
                        <p>Evidence: {s.evidenceReference}</p>
                        <p>Criteria: {s.criteria}</p>
                        <p>Specification: {String(s.snapshot.specification)}</p>
                        <p>Published {new Date(s.createdAt).toLocaleString()}</p>
                        {s.decision ? (
                          <p>
                            {humanize(s.decision.decision)} · Signatory {s.decision.actorId} ·{' '}
                            {new Date(s.decision.createdAt).toLocaleString()} ·{' '}
                            {s.decision.comments}
                          </p>
                        ) : (
                          <p>Awaiting authorized buyer review.</p>
                        )}
                        {a.approving &&
                          s.id === latest?.id &&
                          !s.decision &&
                          s.revisionId === data.revisions[0]?.id && (
                            <ActionForm
                              label="Record sample decision"
                              action={(f) =>
                                send(
                                  `/rfqs/${id}/sample-decisions`,
                                  {
                                    version: r.version,
                                    sampleId: s.id,
                                    decision: text(f, 'decision'),
                                    comments: text(f, 'comments'),
                                  },
                                  C.procurementDecisionSchema,
                                )
                              }
                              onSuccess={resource.reload}
                            >
                              <Select
                                name="decision"
                                label="Sample decision"
                                options={['APPROVED', 'CHANGES_REQUESTED', 'REJECTED']}
                              />
                              <LongText name="comments" label="Decision comments" />
                            </ActionForm>
                          )}
                      </article>
                    ))}
                  </Panel>
                </TabsContent>
                <TabsContent value="quotes">
                  <Panel title="Quotation">
                    {a.negotiating && r.status === 'QUOTED' && (
                      <ActionForm
                        label="Decline quotation"
                        confirm="Decline this quotation?"
                        action={() =>
                          send(`/rfqs/${id}/close`, { version: r.version, next: 'DECLINED' })
                        }
                        onSuccess={resource.reload}
                      />
                    )}
                    {a.operator &&
                      r.status === 'QUOTED' &&
                      data.quotes[0] &&
                      new Date(data.quotes[0].expiresAt) <= new Date() && (
                        <ActionForm
                          label="Record expired quotation"
                          action={() =>
                            send(`/rfqs/${id}/close`, { version: r.version, next: 'EXPIRED' })
                          }
                          onSuccess={resource.reload}
                        />
                      )}
                    {a.operator && ['UNDER_REVIEW', 'QUOTED'].includes(r.status) && (
                      <ActionForm
                        label="Issue quotation"
                        action={(f) =>
                          send(
                            `/rfqs/${id}/quotes`,
                            {
                              version: r.version,
                              totalTnd: text(f, 'totalTnd'),
                              expiresAt: dateValue(f, 'expiresAt'),
                              priceReview: text(f, 'priceReview'),
                              capacityReview: text(f, 'capacityReview'),
                              materialsReview: text(f, 'materialsReview'),
                              taxPolicyReference: text(f, 'taxPolicyReference'),
                              taxBasisPoints: Number(text(f, 'taxBasisPoints')),
                            },
                            C.procurementQuoteSchema,
                          )
                        }
                        onSuccess={resource.reload}
                      >
                        <Input
                          name="totalTnd"
                          label="Total price including configured tax (TND)"
                          required
                        />
                        <Input
                          name="expiresAt"
                          label="Quote expires"
                          type="datetime-local"
                          required
                        />
                        <LongText name="priceReview" label="Current price review" />
                        <LongText name="capacityReview" label="Current capacity review" />
                        <LongText name="materialsReview" label="Current materials review" />
                        <Input
                          name="taxPolicyReference"
                          label="Reviewed synthetic tax policy reference"
                          required
                        />
                        <Input
                          name="taxBasisPoints"
                          label="Configured tax rate in basis points"
                          type="number"
                          min="0"
                          max="10000"
                          step="1"
                          value="0"
                          required
                        />
                      </ActionForm>
                    )}
                    {a.operator && ['UNDER_REVIEW', 'QUOTED'].includes(r.status) && (
                      <CommercialAssessment
                        id={id}
                        version={r.version}
                        send={send}
                        reload={resource.reload}
                      />
                    )}
                    {a.operator && data.feasibility.length > 0 && (
                      <CommercialCosting
                        id={id}
                        version={r.version}
                        feasibilityId={data.feasibility[0].id}
                        send={send}
                        reload={resource.reload}
                      />
                    )}
                    {a.operator && data.costs.some((cost) => !cost.incomplete) && (
                      <CommercialIssue
                        id={id}
                        version={r.version}
                        costId={data.costs.find((cost) => !cost.incomplete)?.id ?? ''}
                        send={send}
                        reload={resource.reload}
                      />
                    )}
                    {a.operator &&
                      data.feasibility.map((item) => (
                        <article key={item.id}>
                          <h3>
                            Feasibility v{item.version} · {item.result.replaceAll('_', ' ')}
                          </h3>
                          <p>{item.explanation}</p>
                          <p>
                            Known remaining {item.knownRemaining ?? 'Unknown'} · Shortage{' '}
                            {item.shortage ?? 'Unknown'} · Effort {item.effortMin ?? 'Unknown'} to{' '}
                            {item.effortMax ?? 'Unknown'} hours
                          </p>
                          {item.constraints.length > 0 && (
                            <p>Constraints: {item.constraints.map((c) => c.code).join(', ')}.</p>
                          )}
                        </article>
                      ))}
                    {a.operator &&
                      data.costs.map((cost) => (
                        <article key={cost.id}>
                          <h3>
                            Cost v{cost.version} ·{' '}
                            {cost.incomplete ? 'Incomplete' : cost.sellingTnd}{' '}
                            {cost.incomplete ? '' : 'TND'}
                          </h3>
                          <p>
                            Subtotal {cost.subtotalTnd} TND · {cost.marginMethod} · Tax{' '}
                            {cost.taxStatus}
                          </p>
                        </article>
                      ))}
                    {!data.quotes.length && <p>No quotation issued yet.</p>}
                    {data.quotes.map((q) => (
                      <article key={q.id}>
                        <h3>
                          Quotation v{q.version} · {q.totalTnd} TND
                        </h3>
                        <p>
                          {q.status.replaceAll('_', ' ')}.
                          {q.current
                            ? ' Current quotation'
                            : ' Historical, accepted or unavailable quotation'}
                          . Valid until {new Date(q.expiresAt).toLocaleString()}.
                        </p>
                        <p>
                          {String(q.snapshot.specification)} · {String(q.snapshot.quantity)} pieces
                          · {String(q.snapshot.deliveryLocation)}
                        </p>
                        <p>
                          {q.snapshot.taxStatus === 'PENDING_LEGAL_REVIEW'
                            ? 'Tax is pending legal review and is not included as a guessed rate.'
                            : `Net ${String(q.snapshot.netTnd)} TND · Tax ${String(q.snapshot.taxTnd)} TND · Policy ${String(q.snapshot.taxPolicyReference)}`}
                        </p>
                        {q.termsSha256 && (
                          <p>
                            Exact terms reference {q.termsSha256.slice(0, 12)}. Acceptance does not
                            reserve capacity, accept artisan work, or collect payment.
                          </p>
                        )}
                        {a.approving && q.current && (
                          <ActionForm
                            label={`Accept quotation v${q.version}`}
                            confirm={`Accept quotation v${q.version} for ${q.totalTnd} TND? This does not reserve production capacity.`}
                            action={(f) =>
                              send(
                                `/rfqs/${id}/accept`,
                                {
                                  version: r.version,
                                  quoteId: q.id,
                                  confirm: f.get('confirm') === 'on',
                                  ...(q.termsSha256 ? { termsSha256: q.termsSha256 } : {}),
                                },
                                C.procurementAcceptSchema,
                              )
                            }
                            onSuccess={resource.reload}
                          >
                            <label>
                              <input type="checkbox" name="confirm" required /> I approve this exact
                              specification, quantity, total, deadline and quotation version.
                            </label>
                          </ActionForm>
                        )}
                        {a.approving && q.status === 'ISSUED' && (
                          <ActionForm
                            label={`Reject quotation v${q.version}`}
                            confirm="Reject this quotation version?"
                            action={(f) =>
                              send(
                                `/rfqs/${id}/quote-rejections`,
                                {
                                  version: r.version,
                                  quoteId: q.id,
                                  reason: text(f, 'reason'),
                                },
                                C.quoteRejectSchema,
                              )
                            }
                            onSuccess={resource.reload}
                          >
                            <Input name="reason" label="Rejection reason" required />
                          </ActionForm>
                        )}
                      </article>
                    ))}
                  </Panel>
                </TabsContent>
                {data.orderId && a.operator && (
                  <TabsContent value="production">
                    <ProductionPanel orderId={data.orderId} />
                    <ExecutionOrder orderId={data.orderId} />
                  </TabsContent>
                )}
                {data.orderId && (
                  <TabsContent value="delivery">
                    <LogisticsOrder orderId={data.orderId} />
                    <BuyerOrderFeedback orderId={data.orderId} />
                  </TabsContent>
                )}
                {data.orderId && (
                  <TabsContent value="finances">
                    <OrderFinance orderId={data.orderId} />
                  </TabsContent>
                )}
                <TabsContent value="discussion">
                  <ProcurementDiscussion id={id} embedded />
                </TabsContent>
                <TabsContent value="documents">
                  <Panel title="Procurement records">
                    <DocumentList items={data.documents} />
                    {a.operator && data.orderId && (
                      <>
                        <ActionForm
                          label="Issue synthetic invoice"
                          action={() => send(`/rfqs/${id}/documents`, { kind: 'INVOICE' })}
                          onSuccess={resource.reload}
                        />
                        <ActionForm
                          label="Create delivery record from persisted shipment"
                          action={() => send(`/rfqs/${id}/documents`, { kind: 'DELIVERY' })}
                          onSuccess={resource.reload}
                        />
                      </>
                    )}
                  </Panel>
                  {a.operator && data.orderId && (
                    <Panel title="Reusable approved product">
                      <ActionForm
                        label="Publish approved product version"
                        action={(f) =>
                          send(
                            `/rfqs/${id}/products`,
                            {
                              version: r.version,
                              productCode: text(f, 'productCode'),
                              materials: text(f, 'materials'),
                              leadTimeDays: Number(text(f, 'leadTimeDays')),
                              leadTimeSampleCount: Number(text(f, 'leadTimeSampleCount')),
                              leadTimeContext: text(f, 'leadTimeContext'),
                            },
                            C.procurementProductSchema,
                          )
                        }
                        onSuccess={resource.reload}
                      >
                        <Input name="productCode" label="Product code" required />
                        <LongText name="materials" label="Compatible materials" />
                        <Input
                          name="leadTimeDays"
                          label="Observed lead time in days"
                          type="number"
                          min="1"
                          max="730"
                          step="1"
                          required
                        />
                        <Input
                          name="leadTimeSampleCount"
                          label="Number of lead-time samples"
                          type="number"
                          min="1"
                          max="10000"
                          step="1"
                          required
                        />
                        <LongText name="leadTimeContext" label="Lead-time evidence and context" />
                      </ActionForm>
                      {data.products.map((p) => (
                        <div key={p.id}>
                          <p>
                            {p.productCode} v{p.version} · {humanize(p.status)}
                          </p>
                          {p.status === 'ACTIVE' && (
                            <ActionForm
                              label={`Discontinue ${p.productCode} v${p.version}`}
                              action={(f) =>
                                send(
                                  `/products/${p.id}/status`,
                                  { status: 'DISCONTINUED', reason: text(f, 'reason') },
                                  C.procurementProductStatusSchema,
                                )
                              }
                              onSuccess={resource.reload}
                            >
                              <LongText name="reason" label="Reason for discontinuing" />
                            </ActionForm>
                          )}
                        </div>
                      ))}
                      <p>
                        Lead times remain estimates for future requests. Publication requires sample
                        approval and an accepted quotation.
                      </p>
                    </Panel>
                  )}
                </TabsContent>
              </Tabs>
            </>
          );
        })()}
    </Workspace>
  );
}
function History({ id, kind }: { id: string; kind: 'activity' | 'revisions' }) {
  const [page, setPage] = useState(1),
    resource = useResource<{
      items: {
        id: string;
        actorLabel?: string;
        code?: string;
        version: number;
        createdAt: string;
        reason?: string;
        authorId?: string;
        predecessorId?: string | null;
        snapshot?: Record<string, unknown>;
      }[];
      hasMore: boolean;
    }>(`${root}/rfqs/${id}/${kind}?page=${page}`);
  return (
    <Panel title={kind === 'activity' ? 'Activity timeline' : 'Specification history'}>
      <ResourceState {...resource} retry={resource.reload} />
      {resource.data && (
        <>
          {resource.data.items.length === 0 && <p>No records yet.</p>}
          <ol className="procurement-list">
            {resource.data.items.map((x) => (
              <li key={x.id}>
                <p>
                  <strong>{x.code ? humanize(x.code.replaceAll('.', '_')) : x.reason}</strong> · v
                  {x.version} · {x.actorLabel ?? x.authorId} ·{' '}
                  {new Date(x.createdAt).toLocaleString()}
                </p>
                {x.snapshot && (
                  <p>
                    {String(x.snapshot.specification)} · {String(x.snapshot.quantity)} pieces ·{' '}
                    {String(x.snapshot.deliveryLocation)}
                  </p>
                )}
                {x.predecessorId && <small>Previous revision: {x.predecessorId}</small>}
              </li>
            ))}
          </ol>
          <Pager page={page} hasMore={resource.data.hasMore} setPage={setPage} />
        </>
      )}
    </Panel>
  );
}
export function ProcurementDiscussion({
  id,
  embedded = false,
}: {
  id: string;
  embedded?: boolean;
}) {
  const [page, setPage] = useState(1),
    resource = useResource<C.ProcurementThread>(`${root}/rfqs/${id}/thread?page=${page}`),
    send = useCommand(),
    data = resource.data;
  const content = (
    <Panel title="Order discussion">
      <ResourceState {...resource} retry={resource.reload} />
      {data && (
        <>
          {!data.items.length && <p>No messages yet.</p>}
          <ol className="procurement-list">
            {data.items.map((m) => (
              <li key={m.id}>
                <p>
                  <strong>{m.authorLabel}</strong> · {new Date(m.createdAt).toLocaleString()}
                  {m.internal && ' · Internal note'}
                </p>
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
              </li>
            ))}
          </ol>
          <Pager page={page} hasMore={data.hasMore} setPage={setPage} />
          {data.canPost && (
            <ActionForm
              label="Send message"
              successMessage="Message delivered."
              action={(f) =>
                send(
                  `/rfqs/${id}/thread`,
                  { body: text(f, 'body'), internal: f.get('internal') === 'on' },
                  C.procurementMessageSchema,
                )
              }
              onSuccess={resource.reload}
            >
              <LongText name="body" label="Message" />
              {data.canPostInternal && (
                <label>
                  <input type="checkbox" name="internal" /> Internal note, hidden from buyers and
                  coordinators
                </label>
              )}
            </ActionForm>
          )}
        </>
      )}
    </Panel>
  );
  return embedded ? (
    content
  ) : (
    <Workspace
      title="Order discussion"
      description="Messages for the permitted participants in this order."
    >
      <Disclosure />
      {content}
    </Workspace>
  );
}
async function download(id: string) {
  const result = await apiFetch<{ filename: string; document: unknown }>(
      `${root}/documents/${id}/download`,
    ),
    url = URL.createObjectURL(
      new Blob([JSON.stringify(result.document, null, 2)], { type: 'application/json' }),
    );
  const link = document.createElement('a');
  link.href = url;
  link.download = result.filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function DocumentList({ items }: { items: C.ProcurementDocumentView[] }) {
  return (
    <>
      {!items.length && <p>No documents are available yet.</p>}
      <ul className="procurement-list">
        {items.map((d) => (
          <li key={d.id}>
            <p>
              {humanize(d.kind)} #{d.number} · v{d.version} · {humanize(d.status)}
              {d.superseded ? ' · Superseded' : ''} · {new Date(d.createdAt).toLocaleDateString()}
            </p>
            <ActionForm
              label={`Download ${d.kind.toLowerCase()} ${d.number}`}
              action={() => download(d.id)}
            />
          </li>
        ))}
      </ul>
    </>
  );
}
export function ProcurementDocuments() {
  const [page, setPage] = useState(1),
    resource = useResource<{ items: C.ProcurementDocumentView[]; hasMore: boolean }>(
      `${root}/documents?page=${page}`,
    );
  return (
    <Workspace
      title="Company documents"
      description="Immutable versions of your company's procurement records."
    >
      <Nav />
      <Disclosure />
      <ResourceState {...resource} retry={resource.reload} />
      {resource.data && (
        <Panel title="Documents">
          <DocumentList items={resource.data.items} />
          <Pager page={page} hasMore={resource.data.hasMore} setPage={setPage} />
        </Panel>
      )}
    </Workspace>
  );
}
export function ProcurementProducts() {
  const [page, setPage] = useState(1),
    resource = useResource<C.ProcurementProducts>(`${root}/products?page=${page}`),
    router = useRouter(),
    send = useCommand();
  return (
    <Workspace
      title="Approved products"
      description="Reuse a reviewed specification. Every reorder starts a new request."
    >
      <Nav />
      <Disclosure />
      <ResourceState {...resource} retry={resource.reload} />
      {resource.data && (
        <>
          <div className="procurement-cards">
            {resource.data.items.map((p) => (
              <Panel key={p.id} title={`${p.productCode} · v${p.version}`}>
                <Badge variant="outline">{humanize(p.status)}</Badge>
                <p>{String(p.snapshot.specification)}</p>
                <p>Materials: {p.materials}</p>
                <p>
                  Indicative lead time: {p.leadTimeDays} days · {p.leadTimeSampleCount} samples ·{' '}
                  {p.leadTimeContext}
                </p>
                {p.status === 'ACTIVE' ? (
                  <details>
                    <summary>Reorder this product</summary>
                    <ActionForm
                      label="Create reorder draft"
                      action={async (f) => {
                        const r = await send<{ id: string }>(
                          `/products/${p.id}/reorder`,
                          {
                            quantity: Number(text(f, 'quantity')),
                            deliveryAt: dateValue(f, 'deliveryAt'),
                            deliveryLocation: text(f, 'deliveryLocation'),
                            confirm: f.get('confirm') === 'on',
                          },
                          C.procurementReorderSchema,
                        );
                        router.push(`/procurement/${r.id}`);
                      }}
                    >
                      <Input
                        name="quantity"
                        label="New quantity in pieces"
                        type="number"
                        min="1"
                        max="1000000"
                        step="1"
                        required
                      />
                      <Input
                        name="deliveryAt"
                        label="New delivery deadline"
                        type="datetime-local"
                        required
                      />
                      <Input name="deliveryLocation" label="New delivery destination" required />
                      <label>
                        <input name="confirm" type="checkbox" required /> Confirm quantity,
                        destination and deadline. Current price, capacity and materials must be
                        reviewed again.
                      </label>
                    </ActionForm>
                  </details>
                ) : (
                  <p>This specification needs a reviewed replacement before reordering.</p>
                )}
              </Panel>
            ))}
          </div>
          {resource.data.items.length === 0 && <p>No approved product versions are available.</p>}
          <Pager page={page} hasMore={resource.data.hasMore} setPage={setPage} />
        </>
      )}
    </Workspace>
  );
}

type Send = (path: string, body: unknown, schema?: z.ZodType) => Promise<unknown>;
const tunis = (value: string) => (value ? new Date(`${value}:00+01:00`).toISOString() : value);
const costLines = [
  ['MATERIALS', 'VARIABLE'],
  ['ARTISAN_LABOR', 'VARIABLE'],
  ['QUALITY_ASSURANCE', 'FIXED'],
  ['LOGISTICS', 'FIXED'],
  ['OVERHEAD', 'FIXED'],
  ['CONTINGENCY', 'FIXED'],
] as const;
function CommercialAssessment({
  id,
  version,
  send,
  reload,
}: {
  id: string;
  version: number;
  send: Send;
  reload(): void;
}) {
  return (
    <ActionForm
      label="Assess feasibility"
      action={(f) =>
        send(
          `/rfqs/${id}/feasibility-assessments`,
          {
            version,
            effectiveFrom: tunis(text(f, 'effectiveFrom')),
            effectiveTo: tunis(text(f, 'effectiveTo')),
            unit: text(f, 'unit'),
            materialStatus: text(f, 'materialStatus'),
            materialSource: text(f, 'materialSource') || undefined,
            logisticsLeadDays: text(f, 'logisticsLeadDays')
              ? Number(text(f, 'logisticsLeadDays'))
              : undefined,
            calendarCleared: f.get('calendarCleared') === 'on',
            calendarSource: text(f, 'calendarSource') || undefined,
          },
          C.feasibilityRequestSchema,
        )
      }
      onSuccess={reload}
    >
      <Input
        name="effectiveFrom"
        label="Production period start (Africa/Tunis)"
        type="datetime-local"
        required
      />
      <Input
        name="effectiveTo"
        label="Production period end (Africa/Tunis)"
        type="datetime-local"
        required
      />
      <Select name="unit" label="Capacity unit" options={['PIECES', 'HOURS']} />
      <Select
        name="materialStatus"
        label="Material attestation"
        options={['UNKNOWN', 'CONFIRMED_AVAILABLE', 'SHORT']}
      />
      <Input name="materialSource" label="Material source, when attested" />
      <Input
        name="logisticsLeadDays"
        label="Logistics lead days, when known"
        type="number"
        min="0"
        max="365"
      />
      <label>
        <input name="calendarCleared" type="checkbox" /> Reviewed calendar shows no known conflict
      </label>
      <Input name="calendarSource" label="Calendar source, when cleared" />
    </ActionForm>
  );
}
function CommercialCosting({
  id,
  version,
  feasibilityId,
  send,
  reload,
}: {
  id: string;
  version: number;
  feasibilityId: string;
  send: Send;
  reload(): void;
}) {
  return (
    <ActionForm
      label="Save cost version"
      action={(f) =>
        send(
          `/rfqs/${id}/cost-estimates`,
          {
            version,
            feasibilityId,
            marginMethod: text(f, 'marginMethod'),
            marginBasisPoints: Number(text(f, 'marginBasisPoints')),
            lines: costLines.map(([category, basis]) => ({
              category,
              basis,
              rateTnd: text(f, category),
            })),
          },
          C.costEstimateSchema,
        )
      }
      onSuccess={reload}
    >
      {costLines.map(([category]) => (
        <Input key={category} name={category} label={`${category} rate in TND`} required />
      ))}
      <Select
        name="marginMethod"
        label="Margin rule"
        options={['NONE', 'MARKUP_ON_COST', 'MARGIN_ON_SELLING_PRICE']}
      />
      <Input
        name="marginBasisPoints"
        label="Margin basis points"
        type="number"
        min="0"
        max="10000"
        value="0"
        required
      />
    </ActionForm>
  );
}
function CommercialIssue({
  id,
  version,
  costId,
  send,
  reload,
}: {
  id: string;
  version: number;
  costId: string;
  send: Send;
  reload(): void;
}) {
  return (
    <ActionForm
      label="Issue costed quotation"
      confirm="Issue this exact cost version? It does not reserve capacity."
      action={(f) =>
        send(
          `/rfqs/${id}/costed-quotes`,
          {
            version,
            costEstimateId: costId,
            expiresAt: tunis(text(f, 'costedExpiresAt')),
            paymentTerms: text(f, 'paymentTerms'),
            deliveryConditions: text(f, 'deliveryConditions'),
          },
          C.costedQuoteSchema,
        )
      }
      onSuccess={reload}
    >
      <Input name="costedExpiresAt" label="Costed quote expires" type="datetime-local" required />
      <Input name="paymentTerms" label="Payment terms" required />
      <Input name="deliveryConditions" label="Delivery conditions" required />
    </ActionForm>
  );
}
export function ProcurementDiscussions() {
  const [page, setPage] = useState(1),
    resource = useResource<{ items: { id: string; title: string }[]; hasMore: boolean }>(
      `${root}/discussions?page=${page}`,
    );
  return (
    <Workspace
      title="Assigned order discussions"
      description="Only orders involving your currently assigned participants appear here."
    >
      <Disclosure />
      <ResourceState {...resource} retry={resource.reload} />
      {resource.data && (
        <Panel title="Conversations">
          {!resource.data.items.length && <p>No assigned order conversations.</p>}
          <ul className="procurement-list">
            {resource.data.items.map((r) => (
              <li key={r.id}>
                <Link href={`/procurement/${r.id}/discussion`}>{r.title}</Link>
              </li>
            ))}
          </ul>
          <Pager page={page} hasMore={resource.data.hasMore} setPage={setPage} />
        </Panel>
      )}
    </Workspace>
  );
}
