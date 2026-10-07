import { z } from 'zod';

/**
 * Shared request validation — ported from legacy src/lib/validation.js with
 * identical field rules and messages, so the API and the forms agree and a
 * bad payload produces `{ error, fields }` instead of a 500.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const passwordRules = z
  .string({ error: 'Password is required.' })
  .min(8, 'Password must be at least 8 characters.')
  .max(128, 'Password must be under 128 characters.');

const emailField = (required: boolean) =>
  z
    .string({ error: required ? 'Email is required.' : 'Email is invalid.' })
    .trim()
    .toLowerCase()
    .default('')
    .pipe(
      z
        .string()
        .refine((v) => !required || v.length > 0, 'Email is required.')
        .refine((v) => v.length <= 254, 'Email is too long.')
        .refine((v) => EMAIL_RE.test(v), 'Enter a valid email address.')
    );

export const loginSchema = z.object({
  email: emailField(true),
  password: z
    .string({ error: 'Password is required.' })
    .default('')
    .pipe(
      z
        .string()
        .refine((v) => v.length > 0, 'Password is required.')
        .refine((v) => v.length <= 128, 'Password is too long.')
    ),
});

export const signupSchema = z.object({
  fullName: z
    .string({ error: 'Please enter your full name.' })
    .trim()
    .default('')
    .pipe(
      z
        .string()
        .refine((v) => v.length >= 3, 'Please enter your full name.')
        .refine((v) => v.length <= 80, 'Full name must be under 80 characters.')
    ),
  email: emailField(true),
  password: passwordRules,
  country: z
    .string({ error: 'Please select your country.' })
    .trim()
    .toUpperCase()
    .default('')
    .pipe(z.string().refine((v) => /^[A-Z]{2}$/.test(v), 'Country must be a 2-letter code.')),
  phone: z
    .string({ error: 'Phone number is invalid.' })
    .trim()
    .max(32, 'Phone number is too long.')
    .default(''),
});

export type ValidateOk = { ok: true; data: Record<string, any> };
export type ValidateErr = {
  ok: false;
  status: 422;
  error: string;
  fields: Record<string, string>;
};

function zodIssues(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues || []) {
    const key = (issue.path?.[0] ?? 'form').toString();
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

export function validate(schema: z.ZodTypeAny, body: unknown): ValidateOk | ValidateErr {
  const parsed = schema.safeParse(body ?? {});
  if (parsed.success) return { ok: true, data: parsed.data as Record<string, any> };
  const fields = zodIssues(parsed.error);
  const first = Object.values(fields)[0] || 'Please check the form and try again.';
  return { ok: false, status: 422, error: first, fields };
}
