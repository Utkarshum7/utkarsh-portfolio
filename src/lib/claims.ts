import { getEntry } from 'astro:content';
import { resolveUrl } from './urls';

export type ResolvedClaim = {
  id: string;
  text: string;
  chip: string;
  label: string;
  href?: string;
  note?: string;
  status: 'VERIFIED' | 'PARTIALLY_VERIFIED' | 'OWNER_CONFIRMED';
};

/**
 * Rule R4: a page that names a claim that doesn't exist fails the static build,
 * because every page is rendered at build time and this throws.
 */
export async function getClaim(id: string): Promise<ResolvedClaim> {
  const entry = await getEntry('claims', id);
  if (!entry) {
    throw new Error(
      `[evidence] Unknown claim "${id}". Add it to src/data/claims.yaml with a publishable status.`,
    );
  }
  const d = entry.data;
  return {
    id,
    text: d.text,
    chip: d.chip ?? d.text,
    label: d.source.label,
    href: d.source.url ? resolveUrl(d.source.url) : undefined,
    note: d.note,
    status: d.status,
  };
}
