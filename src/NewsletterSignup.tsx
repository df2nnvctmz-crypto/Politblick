/**
 * Sign-up box for the Sitzungswochen-Briefing newsletter (sent via Brevo).
 *
 * Deliberately NOT Brevo's embed code: that loads Brevo's script, stylesheet and fonts on every
 * page view, i.e. tells Brevo about every visitor. Instead this is a plain form that posts to the
 * same endpoint Brevo's own form uses — nothing reaches Brevo until someone presses "subscribe".
 * The endpoint answers `?isAjax=1` requests with `{ success, message }` JSON and sends CORS
 * headers, so the result can be shown inline. Double opt-in, the confirmation mail and the
 * honeypot check all stay on Brevo's side. A link in the box switches it to Brevo's
 * unsubscribe form, which is posted the same way.
 */
import { Fragment, useState, type FormEvent, type MouseEvent } from 'react';
import type { Translation } from './data';

const BREVO_SUBSCRIBE_URL =
  'https://a5997b26.sibforms.com/serve/MUIFAPyBuufEi3VHu5aT5HjAiFulRP5pFZaLcQvSWEAhBhd9_J6ZjHox_0s-DC0Xj9a7S1yzpm74Jpx2Ku85HAiWYkPXbFVteHAg_vnGwah3PSYVrMcOa9cu3cLumI5T-eSDzIf-XXRBY-qLXEzP0_ChQy6rXKuHjA57NUS0ruXA8670Z9f2MCxpQciauv8kxb2jcwMiRRMbNXcqKQ==';
const BREVO_UNSUBSCRIBE_URL =
  'https://a5997b26.sibforms.com/serve/MUIFAKFPUPxHyMXCwtGR-PY3aF1fp7rAEfZI3vv9JOGXo8zH7U6rywrpNjc0e5ryWnsneuW69oqSPep8vUXb7eBMRHip3Aih1AWEyS1tpzNj_cuqhe1uLkGqFtwBoSQ7hzNRNUOiYbmo2lkeYg_tb9OUvWeL7feBTWNM-heKmFmIRKG7D1szYlSJaWQFM4bA6lWHFXUsjxn5b6NidQ==';

type Status = 'idle' | 'sending' | 'success' | 'invalid' | 'error';

const MUTED = 'oklch(48% 0.01 260)';
const ACCENT = 'oklch(45% 0.16 265)';

export function NewsletterSignup({
  t,
  privacyHref,
  onOpenPrivacy,
  compact = false,
}: {
  t: Translation;
  privacyHref: string;
  onOpenPrivacy: (e: MouseEvent) => void;
  /** Slim strip for the bottom of content pages (Abstimmungen) instead of the full card. */
  compact?: boolean;
}) {
  const [email, setEmail] = useState('');
  // Brevo's honeypot: humans never see this field, bots fill it in and get silently dropped.
  const [honeypot, setHoneypot] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [mode, setMode] = useState<'subscribe' | 'unsubscribe'>('subscribe');
  const unsub = mode === 'unsubscribe';
  const formUrl = unsub ? BREVO_UNSUBSCRIBE_URL : BREVO_SUBSCRIBE_URL;
  const switchMode = () => {
    setMode(unsub ? 'subscribe' : 'unsubscribe');
    setStatus('idle');
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (status === 'sending') return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setStatus('invalid');
      return;
    }
    setStatus('sending');
    const body = new FormData();
    body.append('EMAIL', email.trim());
    body.append('email_address_check', honeypot);
    body.append('locale', 'de');
    try {
      const res = await fetch(`${formUrl}?isAjax=1`, { method: 'POST', body });
      const json = (await res.json().catch(() => null)) as { success?: boolean } | null;
      setStatus(res.ok && json?.success ? 'success' : 'error');
    } catch {
      setStatus('error');
    }
  }

  const [before, after] = t.newsletterConsentTemplate.split('{privacy}');

  return (
    <section id="newsletter" style={compact ? { marginTop: 48 } : { maxWidth: 1100, margin: '0 auto', padding: '8px 32px 32px', scrollMarginTop: 80 }}>
      <div
        className={compact ? undefined : 'pb-nl-card'}
        style={{
          ...(compact
            ? { borderTop: '1px solid oklch(90% 0.006 260)', padding: '24px 0 0' }
            : { background: 'oklch(97% 0.012 265)', border: '1px solid oklch(88% 0.03 265)', borderRadius: 14, padding: '22px 24px' }),
          display: 'flex',
          flexWrap: 'wrap',
          gap: '16px 32px',
          alignItems: 'flex-start',
        }}
      >
        <div style={{ flex: '1 1 320px', minWidth: 0 }}>
          {compact ? (
            <>
              <h2 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 6px' }}>{t.newsletterCompactTitle}</h2>
              <p style={{ fontSize: 13.5, color: MUTED, lineHeight: 1.55, margin: 0 }}>{t.newsletterCompactBody}</p>
            </>
          ) : (
            <>
              <div style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: ACCENT, marginBottom: 6 }}>
                {t.newsletterKicker}
              </div>
              <h2 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 8px' }}>{t.newsletterTitle}</h2>
              {/* Phones get a one-sentence pitch (.pb-nl-* in index.css): the full one ran to six
                  lines and, with the form below it, made the card a whole screen tall. */}
              <p className="pb-nl-body-full" style={{ fontSize: 14, color: 'oklch(38% 0.01 260)', lineHeight: 1.55, margin: 0 }}>{t.newsletterBody}</p>
              <p className="pb-nl-body-short" style={{ fontSize: 14, color: 'oklch(38% 0.01 260)', lineHeight: 1.5, margin: 0 }}>{t.newsletterBodyShort}</p>
            </>
          )}
        </div>

        <div style={{ flex: '1 1 340px', minWidth: 0 }}>
          {status === 'success' ? (
            <div
              role="status"
              style={{
                fontSize: 14,
                lineHeight: 1.55,
                color: 'oklch(32% 0.09 155)',
                background: 'oklch(96% 0.04 155)',
                border: '1px solid oklch(85% 0.07 155)',
                borderRadius: 10,
                padding: '14px 16px',
              }}
            >
              {unsub ? t.newsletterUnsubSuccess : t.newsletterSuccess}
            </div>
          ) : (
            <form onSubmit={submit} noValidate>
              <label htmlFor="newsletter-email" className={compact ? undefined : 'pb-nl-label'} style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
                {unsub ? t.newsletterUnsubLabel : t.newsletterEmailLabel}
              </label>
              <div className={compact ? undefined : 'pb-nl-row'} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input
                  id="newsletter-email"
                  type="email"
                  name="EMAIL"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (status === 'invalid' || status === 'error') setStatus('idle');
                  }}
                  placeholder={t.newsletterPlaceholder}
                  style={{
                    flex: '1 1 200px',
                    minWidth: 0,
                    fontSize: 15,
                    padding: '10px 12px',
                    border: `1px solid ${status === 'invalid' ? 'oklch(60% 0.16 30)' : 'oklch(82% 0.01 260)'}`,
                    borderRadius: 8,
                    background: 'white',
                    fontFamily: 'inherit',
                  }}
                />
                <button
                  type="submit"
                  disabled={status === 'sending'}
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    padding: '10px 18px',
                    border: 'none',
                    borderRadius: 8,
                    background: unsub ? 'oklch(40% 0.01 260)' : ACCENT,
                    color: 'white',
                    cursor: status === 'sending' ? 'default' : 'pointer',
                    opacity: status === 'sending' ? 0.7 : 1,
                    fontFamily: 'inherit',
                  }}
                >
                  {status === 'sending' ? (
                    t.newsletterSending
                  ) : unsub ? (
                    t.newsletterUnsubSubmit
                  ) : (
                    <>
                      <span className="pb-nl-submit-full">{t.newsletterSubmit}</span>
                      <span className="pb-nl-submit-short">{t.newsletterSubmitShort}</span>
                    </>
                  )}
                </button>
              </div>
              {/* Honeypot — off-screen rather than display:none, as bots skip hidden inputs. */}
              <input
                type="text"
                name="email_address_check"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                value={honeypot}
                onChange={(e) => setHoneypot(e.target.value)}
                style={{ position: 'absolute', left: -10000, width: 1, height: 1, opacity: 0 }}
              />
              {status === 'invalid' && (
                <div role="alert" style={{ fontSize: 13, color: 'oklch(45% 0.16 30)', marginTop: 8 }}>
                  {t.newsletterInvalid}
                </div>
              )}
              {status === 'error' && (
                <div role="alert" style={{ fontSize: 13, color: 'oklch(45% 0.16 30)', marginTop: 8 }}>
                  {t.newsletterError}{' '}
                  <a href={formUrl} target="_blank" rel="noreferrer" style={{ color: 'oklch(45% 0.16 30)' }}>
                    {unsub ? t.newsletterUnsubFallbackLink : t.newsletterFallbackLink}
                  </a>
                  .
                </div>
              )}
              <p className={compact ? undefined : 'pb-nl-note'} style={{ fontSize: 12, color: MUTED, lineHeight: 1.5, margin: '10px 0 0' }}>
                {unsub ? (
                  t.newsletterUnsubHint
                ) : (
                  <>
                    <Fragment>{before}</Fragment>
                    <a href={privacyHref} onClick={onOpenPrivacy} style={{ color: MUTED }}>
                      {t.newsletterPrivacyLink}
                    </a>
                    <Fragment>{after}</Fragment>
                  </>
                )}
              </p>
            </form>
          )}
          <button
            type="button"
            onClick={switchMode}
            style={{ marginTop: 8, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 12, color: MUTED, textDecoration: 'underline', fontFamily: 'inherit' }}
          >
            {unsub ? t.newsletterBackToSubscribe : t.newsletterUnsubLink}
          </button>
        </div>
      </div>
    </section>
  );
}

