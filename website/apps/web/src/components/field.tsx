'use client';
import { useState } from 'react';
import { Input } from './ui/input';
import { Label } from './ui/label';
export function Field({
  name,
  label,
  type = 'text',
  autoComplete,
  error,
  hint,
  defaultValue,
}: {
  name: string;
  label: string;
  type?: string;
  autoComplete?: string;
  error?: string[];
  hint?: string;
  defaultValue?: string;
}) {
  const [visible, setVisible] = useState(false);
  const password = type === 'password';
  return (
    <div className="field">
      <Label htmlFor={name}>{label}</Label>
      <div className="input-wrap">
        <Input
          id={name}
          name={name}
          type={password && visible ? 'text' : type}
          autoComplete={autoComplete}
          defaultValue={defaultValue}
          required
          aria-invalid={Boolean(error?.length)}
          aria-describedby={
            [hint ? `${name}-hint` : '', error?.length ? `${name}-error` : '']
              .filter(Boolean)
              .join(' ') || undefined
          }
        />
        {password && (
          <button
            type="button"
            className="reveal"
            aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
            onClick={() => setVisible((value) => !value)}
          >
            {visible ? 'Hide' : 'Show'}
          </button>
        )}
      </div>
      {hint && (
        <span className="hint" id={`${name}-hint`}>
          {hint}
        </span>
      )}
      {error?.length ? (
        <span className="field-error" id={`${name}-error`}>
          {error.join(' ')}
        </span>
      ) : null}
    </div>
  );
}
