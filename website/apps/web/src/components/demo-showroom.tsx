'use client';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { safeNext } from '@/lib/navigation';
import {
  demoRequest,
  demoSessionRequest,
  demoStageGuidance,
  type DemoPersona,
  type DemoSession,
} from '@/lib/demo-api';
import { humanize } from './workspace-ui';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Alert, AlertDescription } from './ui/alert';
import { Badge } from './ui/badge';
import { LoaderCircle } from 'lucide-react';

function useDemoState() {
  const pathname = usePathname();
  const [data, updateData] = useState<DemoSession | null>(null);
  const revision = useRef(0);
  const setData = useCallback((value: DemoSession) => {
    revision.current++;
    updateData(value);
  }, []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const reload = useCallback(async (background = false) => {
    const requestRevision = ++revision.current;
    if (!background) setLoading(true);
    setError('');
    try {
      const value = await demoSessionRequest();
      if (requestRevision !== revision.current) return;
      updateData({
        ...value,
        personas: value.personas ?? [],
        limitations: value.limitations ?? [],
        scenario: value.scenario ?? null,
      });
    } catch (failure) {
      if (requestRevision === revision.current)
        setError(failure instanceof Error ? failure.message : 'Unable to load your demo.');
    } finally {
      if (requestRevision === revision.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void reload();
  }, [pathname, reload]);
  useEffect(() => {
    // Business actions keep their ordinary scoped APIs. Refresh only this visitor's
    // server projection; never retain a second client-side commercial ledger.
    let disposed = false;
    let running = false;
    const refresh = async () => {
      if (disposed || running || document.visibilityState !== 'visible') return;
      running = true;
      try {
        await reload(true);
      } finally {
        running = false;
      }
    };
    const onVisible = () => void refresh();
    const timer = window.setInterval(onVisible, 5000);
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      disposed = true;
      revision.current++;
      window.clearInterval(timer);
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [reload]);
  return { data, setData, loading, error, reload };
}
const DemoContext = createContext<ReturnType<typeof useDemoState> | null>(null);
export function DemoSessionProvider({ children }: { children: ReactNode }) {
  const session = useDemoState();
  return <DemoContext.Provider value={session}>{children}</DemoContext.Provider>;
}
function useDemoSession() {
  const session = useContext(DemoContext);
  if (!session) throw new Error('Demo components require the isolated demo provider.');
  return session;
}
function displayTotal(name: string, value: string | number, activePersona: string | null) {
  if (name === 'inventoryReservedMilli')
    return {
      label: 'Reserved inventory',
      value: 'Review quantities by unit in the inventory workspace',
    };
  if (name.endsWith('Millimes')) {
    const label =
      name === 'payableMillimes'
        ? 'Recognized payable'
        : name === 'simulatedMillimes'
          ? 'Simulated settlement amount'
          : 'Verified paid';
    if (
      name !== 'verifiedPaidMillimes' &&
      ['buyer', 'artisan', 'coordinator'].includes(activePersona ?? '')
    )
      return { label, value: 'Restricted to the internal finance perspective' };
    const amount = BigInt(value);
    return { label, value: `${amount / 1000n}.${String(amount % 1000n).padStart(3, '0')} TND` };
  }
  return { label: humanize(name.replace(/([a-z])([A-Z])/g, '$1_$2')), value: String(value) };
}
const personaDetails: Record<string, string> = {
  buyer: 'Review your fictional company’s request, approve the exact quote and confirm delivery.',
  production:
    'Review feasibility and costing, prepare offers, release accepted work and coordinate logistics.',
  artisan: 'Review your own work and compensation, decide voluntarily and report production.',
  coordinator: 'Assist assigned participants and record permitted progress and custody reports.',
  qa: 'Inspect submitted production and prepare only approved pieces for shipment.',
  finance: 'Review payable obligations, approval controls and explicitly simulated settlements.',
};
export function DemoShowroom() {
  const session = useDemoSession();
  const [busy, setBusy] = useState('');
  const [feedback, setFeedback] = useState('');
  const [actionError, setActionError] = useState('');
  const keys = useRef(new Map<string, string>());
  async function mutate(
    operation: 'start' | 'switch' | 'reset',
    body: unknown,
    persona?: DemoPersona,
  ) {
    if (!session.data || busy) return;
    const csrfToken = session.data.csrfToken;
    if (!csrfToken) {
      setActionError('Your demo session proof is unavailable. Refresh demo status and try again.');
      return;
    }
    const request = `${operation}:${JSON.stringify(body)}`;
    const key = keys.current.get(request) ?? crypto.randomUUID();
    keys.current.set(request, key);
    setBusy(operation);
    setActionError('');
    setFeedback('');
    try {
      const next = await demoRequest<DemoSession>(operation, {
        body,
        csrfToken,
        idempotencyKey: key,
      });
      session.setData(next);
      keys.current.delete(request);
      if (persona) {
        window.location.assign(safeNext(persona.workspacePath));
        return;
      }
      setFeedback(
        operation === 'reset'
          ? 'Demo reset completed. A fresh scenario generation is ready; earlier synthetic history is preserved.'
          : 'Your isolated synthetic scenario is ready. Choose a persona to begin.',
      );
    } catch (failure) {
      setActionError(failure instanceof Error ? failure.message : 'Unable to update the scenario.');
    } finally {
      setBusy('');
    }
  }
  function reset() {
    const scenario = session.data?.scenario;
    if (
      !scenario ||
      !window.confirm(
        `Reset only your synthetic scenario ${scenario.id}? This creates a fresh generation, signs out its earlier demo sessions and preserves its audit history. Other visitors and real accounts are unaffected. Local safety companion history is separate and is not uploaded or reset here.`,
      )
    )
      return;
    void mutate('reset', {
      scenarioId: scenario.id,
      generation: scenario.generation,
      confirm: true,
    });
  }
  const data = session.data,
    scenario = data?.scenario;
  const active = data?.personas.find((p) => p.id === data.activePersona);
  const stageKey = scenario?.stage.toUpperCase().replaceAll(' ', '_');
  return (
    <div className="demo-showroom mx-auto grid max-w-6xl gap-7 p-5 sm:p-9">
      <header className="max-w-3xl">
        <p className="eyebrow">NASJ · interactive showroom</p>
        <h1>One production story. Six perspectives.</h1>
        <p className="lead">
          Explore a Tunisian artisan-production workflow with fictional organizations and actual
          application transactions. Each perspective retains its real scoped permissions.
        </p>
        <Badge variant="outline">
          SYNTHETIC · No live money or physical inventory verification
        </Badge>
      </header>
      <nav aria-label="Showroom information" className="flex flex-wrap gap-4">
        <Link href="/">About NASJ</Link>
      </nav>
      {session.loading && (
        <p role="status" className="flex items-center gap-2">
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          Loading your demo scenario…
        </p>
      )}
      {(session.error || actionError) && (
        <Alert variant="destructive">
          <AlertDescription>
            <p>{session.error || actionError}</p>
            <Button
              type="button"
              variant="outline"
              disabled={Boolean(busy)}
              onClick={() => void session.reload()}
            >
              Refresh demo status
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {feedback && (
        <p role="status" className="notice success">
          {feedback}
        </p>
      )}
      {data && !data.available && (
        <p>
          This showroom is available only in the isolated demonstration environment. Visit the
          product overview for implemented capabilities and current limitations.
        </p>
      )}
      {data?.available && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>{scenario ? 'Your current scenario' : 'Start your isolated scenario'}</h2>
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <p>
                A versioned synthetic weaving order connects the buyer, production operator,
                authenticated artisan, association coordinator, QA and finance perspectives. There
                are no shared public passwords.
              </p>
              {scenario && (
                <>
                  <dl className="grid gap-2 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="font-semibold">Scenario ID</dt>
                      <dd className="break-all" data-testid="demo-scenario-id">
                        {scenario.id}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-semibold">Shared order reference</dt>
                      <dd className="break-all" data-testid="demo-order-id">
                        {scenario.orderId ?? 'Awaiting buyer acceptance of the quotation'}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-semibold">Buyer request reference</dt>
                      <dd className="break-all">{scenario.rfqId}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold">Seed version and generation</dt>
                      <dd>
                        {scenario.version} · {scenario.generation}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-semibold">Active perspective</dt>
                      <dd>{active?.label ?? 'Choose a persona'}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold">Current stage</dt>
                      <dd>{humanize(scenario.stage)}</dd>
                    </div>
                  </dl>
                  <p>
                    {demoStageGuidance[stageKey ?? ''] ??
                      'Open a permitted workspace to review the actual current records and next business action.'}
                  </p>
                  <nav aria-label="Current scenario workspace" className="flex flex-wrap gap-4">
                    {active && (
                      <Link href={safeNext(active.workspacePath)}>Open active workspace</Link>
                    )}
                    {['buyer', 'production', 'qa'].includes(data.activePersona ?? '') && (
                      <Link href={`/procurement/${scenario.rfqId}`}>
                        Open shared request and order
                      </Link>
                    )}
                    {data.activePersona === 'artisan' && (
                      <>
                        <Link href="/artisan/materials">My materials</Link>
                        <Link href="/artisan/compensation">My compensation</Link>
                      </>
                    )}
                    {data.activePersona === 'coordinator' && (
                      <>
                        <Link href="/association/pickups">Assigned pickups</Link>
                        <Link href="/association/materials">Assigned materials</Link>
                      </>
                    )}
                    {data.activePersona === 'production' && (
                      <Link href="/operator/inventory">Inventory custody</Link>
                    )}
                  </nav>
                  <p className="text-sm text-muted-foreground">
                    State refreshes while this tab is visible and when you return to it. Each
                    workspace applies the active account’s permissions; restricted records remain
                    unavailable.
                  </p>
                  <nav aria-label="Business stage progress">
                    <ol className="flex flex-wrap gap-2">
                      {Object.keys(demoStageGuidance).map((stage) => (
                        <li key={stage} aria-current={stageKey === stage ? 'step' : undefined}>
                          <Badge variant={stageKey === stage ? 'default' : 'outline'}>
                            {humanize(stage)}
                          </Badge>
                        </li>
                      ))}
                    </ol>
                  </nav>
                </>
              )}
              <div className="flex flex-wrap gap-3">
                {!scenario ? (
                  <Button
                    type="button"
                    disabled={Boolean(busy)}
                    onClick={() => void mutate('start', {})}
                  >
                    {busy === 'start' ? 'Creating scenario…' : 'Start Demo'}
                  </Button>
                ) : (
                  <>
                    <Button
                      type="button"
                      disabled={Boolean(busy)}
                      onClick={() => {
                        const persona = active ?? data.personas.find((p) => p.id === 'buyer');
                        if (persona) void mutate('switch', { persona: persona.id }, persona);
                      }}
                    >
                      {busy === 'switch' ? 'Opening workspace…' : 'Resume Scenario'}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={Boolean(busy)}
                      onClick={reset}
                    >
                      {busy === 'reset' ? 'Resetting your demo…' : 'Reset Demo'}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={Boolean(busy) || session.loading}
                      onClick={() => void session.reload()}
                    >
                      Refresh current state
                    </Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
          {scenario && (
            <section aria-labelledby="choose-persona">
              <h2 id="choose-persona">Choose Persona</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {data.personas.map((persona) => (
                  <Card key={persona.id}>
                    <CardHeader>
                      <CardTitle>
                        <h3>{persona.label}</h3>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-4">
                      <p>
                        {personaDetails[persona.id] ??
                          'Explore this independently authorized synthetic workspace.'}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Fictional identity · SYNTHETIC
                      </p>
                      <Button
                        type="button"
                        disabled={Boolean(busy)}
                        variant={active?.id === persona.id ? 'default' : 'outline'}
                        onClick={() => void mutate('switch', { persona: persona.id }, persona)}
                      >
                        Explore {persona.label}
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          )}
          {scenario && (
            <Card>
              <CardHeader>
                <CardTitle>
                  <h2>Actual scenario state</h2>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p>
                  These totals come from the business records in your active scenario generation.
                </p>
                <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {Object.entries(scenario.totals).map(([name, value]) => {
                    const display = displayTotal(name, value, data.activePersona);
                    return (
                      <div key={name}>
                        <dt className="font-semibold">{display.label}</dt>
                        <dd>{display.value}</dd>
                      </div>
                    );
                  })}
                </dl>
              </CardContent>
            </Card>
          )}
          <section aria-labelledby="demo-limitations">
            <h2 id="demo-limitations">Evidence and operating boundaries</h2>
            <ul className="list-disc space-y-2 pl-5">
              {data.limitations.map((limitation) => (
                <li key={limitation}>{limitation}</li>
              ))}
              <li>
                Coordinator-reported accountless acceptance remains pending; it cannot create a
                confirmed production commitment.
              </li>
              <li>
                Reset affects only this visitor’s synthetic business scenario. Optional local
                wearable-safety simulations remain separate.
              </li>
              <li>
                Platform governance administration is separate from these six business perspectives
                and grants no unrestricted commercial access.
              </li>
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
export function DemoScenarioBanner() {
  const session = useDemoSession();
  const data = session.data,
    scenario = data?.scenario;
  return (
    <aside className="demo-banner sticky top-0 z-50" aria-label="Synthetic demo session">
      <strong>SYNTHETIC demonstration</strong> · Fictional accounts · No verified payments
      {scenario && (
        <>
          {' '}
          · Scenario <span className="break-all">{scenario.id}</span> · Generation{' '}
          {scenario.generation} ·{' '}
          {data.personas.find((p) => p.id === data.activePersona)?.label ?? 'No active perspective'}{' '}
          · {humanize(scenario.stage)} · Shared order{' '}
          <span className="break-all" data-testid="demo-banner-order-id">
            {scenario.orderId ?? 'awaiting buyer acceptance'}
          </span>
        </>
      )}{' '}
      · <Link href="/demo">{scenario ? 'Switch persona or reset' : 'Open showroom'}</Link>
      {session.error && <span> · Scenario status unavailable; reopen the showroom to retry.</span>}
    </aside>
  );
}
