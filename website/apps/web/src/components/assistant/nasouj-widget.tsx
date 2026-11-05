'use client';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Send, X } from 'lucide-react';
import {
  nasoujCopy,
  nasoujReply,
  nasoujTopics,
  type NasoujLocale,
  type NasoujRole,
} from './nasouj-demo-replies';
import { nasoujArt } from './nasouj-assets';

type Message = { id: number; from: 'user' | 'nasouj'; text: string };

const locales: { id: NasoujLocale; label: string; name: string }[] = [
  { id: 'en', label: 'EN', name: 'English' },
  { id: 'fr', label: 'FR', name: 'Français' },
  { id: 'ar', label: 'ع', name: 'العربية' },
];
const supportLabel: Record<NasoujLocale, string> = {
  en: 'Talk to a person',
  fr: 'Parler à une personne',
  ar: 'التحدث إلى شخص',
};
const WORD_DELAY_MS = 45;
const THINKING_MS = 700;

export function NasoujWidget({ role }: { role: NasoujRole }) {
  const [open, setOpen] = useState(false);
  const [locale, setLocale] = useState<NasoujLocale>('en');
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [state, setState] = useState<'idle' | 'thinking' | 'answering'>('idle');
  const nextId = useRef(1);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const log = useRef<HTMLDivElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  });
  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  function close() {
    setOpen(false);
    launcher.current?.focus();
  }
  function ask(question: string) {
    const text = question.trim();
    if (!text || state !== 'idle') return;
    setDraft('');
    setMessages((current) => [...current, { id: nextId.current++, from: 'user', text }]);
    setState('thinking');
    const words = nasoujReply(role, locale, text).split(' ');
    const id = nextId.current++;
    timer.current = setTimeout(() => {
      setState('answering');
      setMessages((current) => [...current, { id, from: 'nasouj', text: '' }]);
      let shown = 0;
      const step = () => {
        shown += 1;
        const partial = words.slice(0, shown).join(' ');
        setMessages((current) =>
          current.map((message) => (message.id === id ? { ...message, text: partial } : message)),
        );
        if (shown < words.length) timer.current = setTimeout(step, WORD_DELAY_MS);
        else setState('idle');
      };
      step();
    }, THINKING_MS);
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    ask(draft);
  }

  if (!open)
    return (
      <button
        ref={launcher}
        type="button"
        className="nasouj-launcher"
        onClick={() => setOpen(true)}
        aria-label="Open Nasouj assistant"
      >
        <Image src={nasoujArt.poses.wave} alt="" width={72} height={97} />
        <span>Nasouj</span>
      </button>
    );

  const dir = locale === 'ar' ? 'rtl' : 'ltr';
  return (
    <section
      className="nasouj-panel"
      aria-label="Nasouj assistant"
      onKeyDown={(event) => {
        if (event.key === 'Escape') close();
      }}
    >
      <header className="nasouj-panel-header">
        <Image src={nasoujArt.avatar} alt="" width={40} height={40} />
        <div className="nasouj-panel-title">
          <strong>Nasouj</strong>
          <span>{nasoujCopy.preview[locale]}</span>
        </div>
        <fieldset className="nasouj-locales">
          <legend className="sr-only">Language</legend>
          {locales.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-label={item.name}
              aria-pressed={locale === item.id}
              onClick={() => setLocale(item.id)}
            >
              {item.label}
            </button>
          ))}
        </fieldset>
        <button
          type="button"
          className="nasouj-close"
          onClick={close}
          aria-label={nasoujCopy.close[locale]}
        >
          <X aria-hidden="true" size={18} />
        </button>
      </header>
      <div className="nasouj-log" ref={log} role="log" aria-live="polite" dir={dir} lang={locale}>
        <div className="nasouj-welcome">
          <Image
            src={state === 'thinking' ? nasoujArt.poses.thinking : nasoujArt.poses.wave}
            alt=""
            width={72}
            height={97}
          />
          <p className="nasouj-bubble nasouj-from-nasouj">{nasoujCopy.greeting[locale]}</p>
        </div>
        {messages.map((message) => (
          <p key={message.id} className={`nasouj-bubble nasouj-from-${message.from}`}>
            {message.text}
          </p>
        ))}
        {state === 'thinking' && (
          <p className="nasouj-bubble nasouj-from-nasouj nasouj-typing">
            <i />
            <i />
            <i />
            <span className="sr-only">Nasouj is typing</span>
          </p>
        )}
      </div>
      <div className="nasouj-suggestions" dir={dir} lang={locale}>
        {nasoujTopics[role].map((topic) => (
          <button
            key={topic.question.en}
            type="button"
            disabled={state !== 'idle'}
            onClick={() => ask(topic.question[locale])}
          >
            {topic.question[locale]}
          </button>
        ))}
      </div>
      <form className="nasouj-form" onSubmit={submit} dir={dir} lang={locale}>
        <input
          ref={input}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={nasoujCopy.placeholder[locale]}
          aria-label={nasoujCopy.placeholder[locale]}
          maxLength={500}
          dir="auto"
        />
        <button
          type="submit"
          disabled={!draft.trim() || state !== 'idle'}
          aria-label={nasoujCopy.send[locale]}
        >
          <Send aria-hidden="true" size={18} />
        </button>
      </form>
      <Link className="nasouj-support" href="/support/cases" dir={dir} lang={locale}>
        {supportLabel[locale]}
      </Link>
    </section>
  );
}
