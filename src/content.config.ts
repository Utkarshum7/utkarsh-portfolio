import { defineCollection, reference } from 'astro:content';
import { z } from 'astro/zod';
import { file, glob } from 'astro/loaders';

/*
 * Evidence rules enforced here:
 *  R1 chips/evidence must reference an existing claim   → reference('claims')
 *  R2 only publishable statuses exist                    → status enum
 *  R3 public source URL (or decision for owner-confirmed), human-readable label → claim superRefine
 *  R6 a flagship needs a case study and ≥ 3 evidence claims → project superRefine
 * Hidden projects have no files in this repository at all.
 */

const PATHLIKE = /[/\\]|\.(py|ts|js|md|json|csv|yaml|yml)\b|\b[0-9a-f]{12,40}\b|localhost|^[A-Z]:/i;

const claims = defineCollection({
  loader: file('src/data/claims.yaml'),
  schema: z
    .object({
      text: z.string().min(1),
      chip: z.string().max(40).optional(),
      status: z.enum(['VERIFIED', 'PARTIALLY_VERIFIED', 'OWNER_CONFIRMED']),
      decision: z
        .string()
        .regex(/^D-\d{3}$/)
        .optional(),
      source: z.object({
        label: z
          .string()
          .min(3)
          .refine(
            (l) => !PATHLIKE.test(l),
            'Source label must be human-readable (no paths, hashes or hosts)',
          ),
        url: z
          .string()
          .refine(
            (u) =>
              u.startsWith('repo:') || (/^https:\/\//.test(u) && !/localhost|127\.0\.0\.1|\[::1\]/.test(u)),
            'Source URL must be public https or a repo: reference',
          )
          .optional(),
      }),
      checked: z.coerce.date(),
      note: z.string().optional(),
    })
    .superRefine((c, ctx) => {
      if (c.status === 'OWNER_CONFIRMED' && !c.decision) {
        ctx.addIssue({ code: 'custom', message: 'OWNER_CONFIRMED claims need `decision: D-xxx`' });
      }
      if (c.status !== 'OWNER_CONFIRMED' && !c.source.url) {
        ctx.addIssue({ code: 'custom', message: 'Verified claims need a public source URL' });
      }
    }),
});

const projects = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/projects' }),
  schema: z
    .object({
      title: z.string().max(60),
      tier: z.enum(['flagship', 'supporting', 'archive']),
      order: z.number().int(),
      caseStudy: z.boolean().default(false),
      summary: z.string().max(260),
      problem: z.string().max(320).optional(),
      context: z.string().max(40).optional(),
      cardNote: z.string().max(140).optional(),
      year: z.number().int().min(2020).max(2030),
      /** Disciplines the project demonstrates; drives the area tags and the /work filters */
      areas: z.array(z.enum(['backend', 'ai', 'cloud', 'frontend'])).min(1),
      builtWith: z
        .array(z.object({ purpose: z.string(), tech: z.string() }))
        .max(8)
        .default([]),
      stackLine: z.string().max(80).optional(),
      links: z
        .object({
          repo: z.string().optional(),
          live: z.url().optional(),
          liveNote: z.string().optional(),
        })
        .default({}),
      chips: z.array(reference('claims')).max(3).default([]),
      evidence: z.array(z.object({ claim: reference('claims'), what: z.string().min(3) })).default([]),
      seo: z.object({ title: z.string().max(90), description: z.string().max(160) }).optional(),
    })
    .superRefine((p, ctx) => {
      if (p.tier === 'flagship' && !p.caseStudy) {
        ctx.addIssue({ code: 'custom', message: 'Flagship projects must have a case study' });
      }
      if (p.tier === 'flagship' && p.evidence.length < 3) {
        ctx.addIssue({ code: 'custom', message: 'Flagship projects need at least 3 evidence claims' });
      }
      if (p.caseStudy && !p.seo) {
        ctx.addIssue({ code: 'custom', message: 'Case studies need seo.title and seo.description' });
      }
    }),
});

export const collections = { claims, projects };
