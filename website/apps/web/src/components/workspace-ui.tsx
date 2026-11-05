'use client';
import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useState,
  useTransition,
  useRef,
  useId,
} from 'react';
import type { ReactNode, FormEvent } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import Link from 'next/link';
import { useHydrated } from '@/lib/use-hydrated';
import type { WorkspaceAction } from '@/lib/app-navigation';
import { Icon } from './icons';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Input as ShadcnInput } from './ui/input';
import { Label } from './ui/label';
import { NativeSelect } from './ui/native-select';
import { Alert, AlertDescription } from './ui/alert';
import { ArrowLeft, CircleCheck, LoaderCircle, ArrowUpRight } from 'lucide-react';
import { Modal } from './ui/modal';

const FieldErrors = createContext<Record<string, string[]>>({});
export function useFieldError(name: string) {
  return useContext(FieldErrors)[name] ?? [];
}

export function useResource<T>(path: string) {
  const [result, setResult] = useState<{ path: string; value: T } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [settledPath, setSettledPath] = useState<string | null>(null);
  const [needsMfa, setNeedsMfa] = useState(false);
  const version = useRef(0);
  const reload = useCallback(async () => {
    const requestVersion = ++version.current;
    setLoading(true);
    setError('');
    setNeedsMfa(false);
    try {
      const value = await apiFetch<T>(path);
      if (requestVersion === version.current) setResult({ path, value });
    } catch (failure) {
      if (requestVersion === version.current) {
        setResult(null);
        setNeedsMfa(failure instanceof ApiError && failure.detail.code === 'MFA_REQUIRED');
        setError(failure instanceof Error ? failure.message : 'Unable to load this workspace.');
      }
    } finally {
      if (requestVersion === version.current) {
        setSettledPath(path);
        setLoading(false);
      }
    }
  }, [path]);
  useEffect(() => {
    void reload();
    return () => {
      ++version.current;
    };
  }, [reload]);
  return {
    data: result?.path === path ? result.value : null,
    error: settledPath === path ? error : '',
    loading: loading || settledPath !== path,
    reload,
    needsMfa: settledPath === path && needsMfa,
  };
}
const FeedbackContext = createContext<((message: string) => void) | null>(null);

// Lets a settings section sit on one shared page, without its own page heading.
export function SectionShell({
  embedded,
  title,
  description,
  children,
}: {
  embedded: boolean;
  title: string;
  description: string;
  children: ReactNode;
}) {
  if (embedded) return children;
  return (
    <Workspace title={title} description={description}>
      {children}
    </Workspace>
  );
}
export function Workspace({
  title,
  description,
  children,
  back,
  actions,
}: {
  title: string;
  description: string;
  children: ReactNode;
  back?: string;
  actions?: ReactNode;
}) {
  const [feedback, setFeedback] = useState('');
  return (
    <FeedbackContext.Provider value={setFeedback}>
      <div className="page-heading">
        <div>
          {back && (
            <Link className="page-back" href={back} aria-label="Back">
              <ArrowLeft size={22} aria-hidden="true" />
            </Link>
          )}
          <h1>{title}</h1>
          <p className="lead">{description}</p>
        </div>
        {actions}
      </div>
      {feedback && (
        <Alert className="notice success" role="status">
          <CircleCheck aria-hidden="true" />
          <AlertDescription>{feedback}</AlertDescription>
        </Alert>
      )}
      {children}
    </FeedbackContext.Provider>
  );
}
export function WorkspaceActions({
  actions,
  label = 'Workspace actions',
}: {
  actions: WorkspaceAction[];
  label?: string;
}) {
  return (
    <nav aria-label={label} className="workspace-actions">
      {actions.map((action) => (
        <Card key={action.href} className="workspace-action-card gap-0 p-0">
          <Link href={action.href} aria-label={action.label} className="workspace-action">
            <span className="workspace-action-icon">
              <Icon name={action.icon} />
            </span>
            <div>
              <h2>{action.label}</h2>
              <p>{action.description}</p>
            </div>
            <ArrowUpRight className="size-4 shrink-0" aria-hidden="true" />
          </Link>
        </Card>
      ))}
    </nav>
  );
}
export function ResourceState({
  loading,
  error,
  retry,
  needsMfa = false,
}: {
  loading: boolean;
  error: string;
  retry: () => unknown;
  needsMfa?: boolean;
}) {
  return loading ? (
    <p className="resource-loading" role="status">
      <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
      Loading workspace…
    </p>
  ) : error ? (
    <div className="notice" role="alert">
      <p>{error}</p>
      {needsMfa && (
        <p>
          <Link href="/settings/security">Set up or verify two-factor authentication</Link>
        </p>
      )}
      <Button variant="outline" type="button" onClick={retry}>
        Try again
      </Button>
    </div>
  ) : null;
}
export function ActionForm({
  children,
  action,
  label,
  confirm,
  onSuccess,
  className,
  successMessage = 'Saved successfully.',
}: {
  children?: ReactNode;
  action: (data: FormData) => Promise<unknown>;
  label: string;
  confirm?: string;
  onSuccess?: () => unknown;
  className?: string;
  successMessage?: string;
}) {
  const ready = useHydrated();
  const feedback = useContext(FeedbackContext);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState('');
  const [needsMfa, setNeedsMfa] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [awaitingConfirm, setAwaitingConfirm] = useState<FormData | null>(null);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (confirm) setAwaitingConfirm(data);
    else run(data);
  }
  function run(data: FormData) {
    setError('');
    setFieldErrors({});
    setMessage('');
    setNeedsMfa(false);
    feedback?.('');
    start(async () => {
      try {
        await action(data);
        await onSuccess?.();
        if (feedback) feedback(successMessage);
        else setMessage(successMessage);
      } catch (failure) {
        setNeedsMfa(failure instanceof ApiError && failure.detail.code === 'MFA_REQUIRED');
        setFieldErrors(failure instanceof ApiError ? (failure.detail.fieldErrors ?? {}) : {});
        setError(failure instanceof Error ? failure.message : 'Unable to save. Please try again.');
      }
    });
  }
  return (
    <form method="post" onSubmit={submit} className={className}>
      {confirm && (
        <Modal
          open={awaitingConfirm !== null}
          onOpenChange={(open) => !open && setAwaitingConfirm(null)}
          title={confirm}
        >
          <div className="modal-actions">
            <Button type="button" variant="outline" onClick={() => setAwaitingConfirm(null)}>
              Go back
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (awaitingConfirm) run(awaitingConfirm);
                setAwaitingConfirm(null);
              }}
            >
              {label}
            </Button>
          </div>
        </Modal>
      )}
      <FieldErrors.Provider value={fieldErrors}>
        <fieldset disabled={pending || !ready} aria-busy={pending}>
          {children}
          <Button type="submit" className="action-submit">
            {pending ? 'Saving…' : label}
          </Button>
        </fieldset>
      </FieldErrors.Provider>
      {message && (
        <p className="notice success" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="notice" role="alert">
          {error}
          {needsMfa && (
            <>
              {' '}
              <Link href="/settings/security">Set up two-factor authentication</Link>.
            </>
          )}
        </p>
      )}
    </form>
  );
}
export function Input({
  name,
  label,
  value,
  type = 'text',
  required = false,
  min,
  max,
  step,
}: {
  name: string;
  label: string;
  value?: string | number | null;
  type?: string;
  required?: boolean;
  min?: string;
  max?: string;
  step?: string;
}) {
  const id = useId();
  const errors = useFieldError(name);
  return (
    <div className="field">
      <Label htmlFor={id}>{label}</Label>
      <ShadcnInput
        id={id}
        aria-invalid={errors.length ? true : undefined}
        aria-describedby={errors.length ? `${id}-error` : undefined}
        name={name}
        defaultValue={value ?? ''}
        type={type}
        required={required}
        min={min}
        max={max}
        step={step}
      />
      {errors.length > 0 && (
        <p id={`${id}-error`} className="field-error">
          {errors.join(' ')}
        </p>
      )}
    </div>
  );
}
export function Select({
  name,
  label,
  value,
  options,
  required = false,
}: {
  name: string;
  label: string;
  value?: string;
  options: readonly string[] | readonly { value: string; label: string }[];
  required?: boolean;
}) {
  const id = useId();
  const errors = useFieldError(name);
  return (
    <div className="field">
      <Label htmlFor={id}>{label}</Label>
      <NativeSelect
        id={id}
        aria-label={label}
        aria-invalid={errors.length ? true : undefined}
        aria-describedby={errors.length ? `${id}-error` : undefined}
        name={name}
        defaultValue={value}
        required={required}
      >
        {options.map((item) =>
          typeof item === 'string' ? (
            <option key={item} value={item}>
              {humanize(item)}
            </option>
          ) : (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ),
        )}
      </NativeSelect>
      {errors.length > 0 && (
        <p id={`${id}-error`} className="field-error">
          {errors.join(' ')}
        </p>
      )}
    </div>
  );
}
export function humanize(value: string) {
  if (value === 'NASJ_OPERATOR') return 'NASJ operator';
  return value
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/^./, (letter) => letter.toUpperCase());
}
export function text(data: FormData, name: string) {
  return String(data.get(name) ?? '').trim();
}
export function Checkboxes({
  name,
  options,
  selected = [],
}: {
  name: string;
  options: readonly string[];
  selected?: string[];
}) {
  return (
    <div className="check-options">
      {options.map((option) => (
        <label key={option}>
          <input
            type="checkbox"
            name={name}
            value={option}
            defaultChecked={selected.includes(option)}
          />
          {humanize(option)}
        </label>
      ))}
    </div>
  );
}

/** Native selection field for forms that need explicit options or controlled selection. */
export function Choice({
  label,
  ...props
}: React.ComponentProps<typeof NativeSelect> & { label: string }) {
  const id = useId();
  return (
    <div className="field">
      <Label htmlFor={id}>{label}</Label>
      <NativeSelect id={id} aria-label={label} {...props} />
    </div>
  );
}
