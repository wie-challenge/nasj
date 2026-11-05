'use client';
import { useEffect, useState } from 'react';
import { traceModules } from '@/lib/trace-qr';

export function TraceQr({ value }: { value: string }) {
  const { size, cells } = traceModules(value);
  const modules = cells
    .flatMap((filled, index) =>
      filled ? [`M${index % size} ${Math.floor(index / size)}h1v1h-1z`] : [],
    )
    .join('');
  return (
    <svg
      className="trace-qr"
      viewBox={`-4 -4 ${size + 8} ${size + 8}`}
      role="img"
      aria-label="QR code for the public traceability page"
    >
      <rect x={-4} y={-4} width={size + 8} height={size + 8} fill="#ffffff" />
      <path d={modules} fill="#17211b" />
    </svg>
  );
}
export function PublicTraceCode({ path }: { path: string }) {
  const [value, setValue] = useState('');
  useEffect(() => setValue(`${window.location.origin}${path}`), [path]);
  if (!value) return null;
  return (
    <figure className="trace-sheet">
      <TraceQr value={value} />
      <figcaption>
        Synthetic public QR. Scanning it opens the traceability page. It is not a carrier tracking
        code.
      </figcaption>
    </figure>
  );
}
