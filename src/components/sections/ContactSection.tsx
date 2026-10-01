'use client';

import { useRef, useState, type FormEvent } from 'react';
import { motion, useInView } from 'framer-motion';
import { z } from 'zod';
import { getApiUrl } from '@/lib/api/api-url';
import {
  emailField,
  fieldErrors,
  firstNameField,
  lastNameField,
  normalizePhMobile,
  optionalMobileField,
} from '@/lib/validation/fields';

const ROLES = ['fmcg', 'shipper', 'other'] as const;
type Role = (typeof ROLES)[number];

// Same name / email / phone rules as every account in the system; the backend
// (POST /api/public/contact) checks them again before emailing the company.
const contactSchema = z.object({
  first_name: firstNameField,
  last_name:  lastNameField,
  email:      emailField,
  phone:      optionalMobileField,
  role:       z.enum(ROLES),
  message:    z
    .string()
    .trim()
    .min(10, 'Message must be at least 10 characters')
    .max(2000, 'Message is too long (2000 characters at most)'),
});

type ContactForm = {
  first_name: string;
  last_name:  string;
  email:      string;
  phone:      string;
  message:    string;
  // Honeypot: hidden from people, so only a bot fills it in.
  website:    string;
};

const emptyForm: ContactForm = { first_name: '', last_name: '', email: '', phone: '', message: '', website: '' };

const labelClass = "font-'Alegreysa Sans SC, sans-serif' text-white/60 text-[0.65rem] tracking-widest uppercase mb-1.5 block";

const inputClass = `w-full bg-[#1a1a1a] border rounded-[8px]
  px-3 py-2.5 text-white text-sm font-'Alegreysa Sans SC, sans-serif'
  focus:outline-none focus:border-[#4df9ed]/40 transition-colors`;

const TEXT_FIELDS: {
  key:          'first_name' | 'last_name' | 'email' | 'phone';
  label:        string;
  type:         string;
  autoComplete: string;
  placeholder?: string;
  optional?:    boolean;
}[] = [
  { key: 'first_name', label: 'First Name', type: 'text',  autoComplete: 'given-name' },
  { key: 'last_name',  label: 'Last Name',  type: 'text',  autoComplete: 'family-name' },
  { key: 'email',      label: 'Email',      type: 'email', autoComplete: 'email' },
  { key: 'phone',      label: 'Phone',      type: 'tel',   autoComplete: 'tel', placeholder: '0917 123 4567', optional: true },
];

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-red-400 text-[0.7rem] mt-1">{message}</p>;
}

export default function ContactSection() {
  const ref    = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });

  const [role, setRole]       = useState<Role>('fmcg');
  const [form, setForm]       = useState<ContactForm>(emptyForm);
  const [errors, setErrors]   = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [status, setStatus]   = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const set = (key: keyof ContactForm, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => (e[key] ? { ...e, [key]: '' } : e));
    setStatus(null);
  };

  const borderFor = (key: string) => (errors[key] ? 'border-red-400/60' : 'border-white/[0.10]');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (sending) return;

    const checked = contactSchema.safeParse({
      first_name: form.first_name,
      last_name:  form.last_name,
      email:      form.email,
      phone:      normalizePhMobile(form.phone),
      role,
      message:    form.message,
    });
    if (!checked.success) {
      setErrors(fieldErrors(checked.error));
      return;
    }

    setSending(true);
    setStatus(null);
    try {
      // No cookies on purpose: a public form has nothing to do with a signed-in
      // visitor's session, and leaving them off keeps CSRF out of the picture.
      const res = await fetch(`${getApiUrl()}/public/contact`, {
        method:      'POST',
        headers:     { 'Content-Type': 'application/json' },
        credentials: 'omit',
        body:        JSON.stringify({ ...checked.data, website: form.website }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const serverErrors: Array<{ field: string; message: string }> = data?.errors ?? [];
        if (serverErrors.length) {
          setErrors(Object.fromEntries(serverErrors.map((x) => [x.field, x.message])));
        }
        setStatus({ kind: 'error', text: data?.message ?? 'We could not send your message. Please try again.' });
        return;
      }
      setForm(emptyForm);
      setRole('fmcg');
      setErrors({});
      setStatus({ kind: 'success', text: 'Thank you. Your message has been sent, and our team will get back to you soon.' });
    } catch {
      setStatus({ kind: 'error', text: 'We could not reach our server. Please check your connection and try again.' });
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <section id="contact" className="relative w-full bg-[#0a0a0a] py-16 sm:py-20 md:py-28 overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)',
            backgroundSize: '80px 80px',
          }}
        />

        <div ref={ref} className="relative z-10 max-w-[1100px] mx-auto px-5 sm:px-8 md:px-12">

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6 }}
            className="text-center mb-4 sm:mb-5"
          >
            <h2 className="font-display-italic text-white leading-[1.0]">
              CONTACT OUR
              <br />
              <span className="font-display-italic text-[#4df9ed]">LOGISTICS EXPERTS</span>
            </h2>
          </motion.div>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="font-'Alegreysa Sans SC, sans-serif' text-[#818181]
              text-center tracking-widest uppercase mb-10 sm:mb-14 max-w-2xl mx-auto leading-relaxed"
          >
            Be our partner by sending us a message. Our team is here to assist you with any logistics
            inquiries or service requests. Fast, direct, and reliable.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.65, delay: 0.18 }}
            className="rounded-[20px] border border-white/[0.10] bg-[#111]
              grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-0 overflow-hidden"
          >

            <form className="relative p-6 sm:p-8 md:p-10" onSubmit={handleSubmit} noValidate>
              <div aria-hidden="true" className="absolute -left-[9999px] top-0 w-px h-px overflow-hidden">
                <label>
                  Website
                  <input
                    type="text"
                    tabIndex={-1}
                    autoComplete="off"
                    value={form.website}
                    onChange={(e) => set('website', e.target.value)}
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                {TEXT_FIELDS.map(({ key, label, type, autoComplete, placeholder, optional }) => (
                  <div key={key}>
                    <label htmlFor={`contact-${key}`} className={labelClass}>
                      {label}
                      {optional && <span className="text-white/30 normal-case tracking-normal"> (optional)</span>}
                    </label>
                    <input
                      id={`contact-${key}`}
                      type={type}
                      autoComplete={autoComplete}
                      placeholder={placeholder}
                      value={form[key]}
                      onChange={(e) => set(key, e.target.value)}
                      aria-invalid={!!errors[key]}
                      className={`${inputClass} ${borderFor(key)}`}
                    />
                    <FieldError message={errors[key]} />
                  </div>
                ))}
              </div>

              <div className="mb-4">
                <span className="font-'Alegreysa Sans SC, sans-serif' text-white/60 text-[0.65rem] tracking-widest uppercase mb-2 block">
                  Your Role or Company
                </span>
                <div className="flex flex-wrap gap-x-5 gap-y-2" role="radiogroup">
                  {ROLES.map((r) => (
                    <label key={r} className="flex items-center gap-2 cursor-pointer group">
                      <input
                        type="radio"
                        name="contact-role"
                        value={r}
                        checked={role === r}
                        onChange={() => setRole(r)}
                        className="sr-only"
                      />
                      <div
                        className={`w-3.5 h-3.5 rounded-full border-2 transition-all duration-200 cursor-pointer
                          ${role === r
                            ? 'border-[#4df9ed] bg-[#4df9ed]'
                            : 'border-white/30 group-hover:border-white/60'
                          }`}
                      />
                      <span className="font-'Alegreysa Sans SC, sans-serif' text-white/70 text-xs tracking-wider uppercase">
                        {r}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="mb-6">
                <label htmlFor="contact-message" className={labelClass}>
                  Message
                </label>
                <textarea
                  id="contact-message"
                  rows={4}
                  maxLength={2000}
                  value={form.message}
                  onChange={(e) => set('message', e.target.value)}
                  aria-invalid={!!errors.message}
                  className={`${inputClass} ${borderFor('message')} resize-none`}
                />
                <FieldError message={errors.message} />
              </div>

              <button
                type="submit"
                disabled={sending}
                className="font-'Alegreysa Sans SC, sans-serif' bg-white text-[#0a0a0a] px-7 py-2.5 rounded-[8px]
                  text-sm tracking-wider font-semibold
                  hover:bg-white/90 transition-all duration-300 cursor-pointer w-full sm:w-auto
                  disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {sending ? 'Sending…' : 'Submit'}
              </button>

              {status && (
                <p
                  role="status"
                  className={`mt-4 text-sm ${status.kind === 'success' ? 'text-[#4df9ed]' : 'text-red-400'}`}
                >
                  {status.text}
                </p>
              )}
            </form>

            <div className="border-t lg:border-t-0 lg:border-l border-white/[0.08]
              p-6 sm:p-8 md:p-10 bg-[#0f0f0f]">
              <h3 className="font-'Alegreysa Sans SC, sans-serif' text-white text-sm tracking-widest uppercase mb-1">
                Contact Details
              </h3>
              <p className="font-'Alegreysa Sans SC, sans-serif' text-white/40 text-xs tracking-wide mb-8 leading-relaxed">
                For direct support or partnership inquiries.
              </p>

              <div className="flex flex-col gap-5">
                <div className="flex items-start gap-3">
                  <span className="text-[#4df9ed] text-base mt-0.5">📞</span>
                  <span className="font-'Alegreysa Sans SC, sans-serif' text-white/70 text-sm leading-relaxed">
                    +63 9685 536 8975
                  </span>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-[#4df9ed] text-base mt-0.5">✉️</span>
                  <span className="font-'Alegreysa Sans SC, sans-serif' text-white/70 text-sm leading-relaxed break-all">
                    8338LogisticsServices@gmail.com
                  </span>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-[#4df9ed] text-base mt-0.5">📍</span>
                  <span className="font-'Alegreysa Sans SC, sans-serif' text-white/70 text-sm leading-relaxed">
                    Blk. 6 Lot 8 Lynville Enclave,
                    Mamatid, City of Cabuyao, Laguna
                  </span>
                </div>
              </div>
            </div>

          </motion.div>
        </div>
      </section>
    </>
  );
}
