/**
 * Certifications.
 * `verifyUrl` is an issuer verification link (only where one was verified). `file` is a site-hosted copy under
 * public/; if the file isn't present yet, the entry renders without a link. Drop the file in, no redesign needed.
 */
export type Certification = {
  name: string;
  issuer: string;
  dates: string;
  claim: string;
  verifyUrl?: string;
  file?: string;
};

export const certifications: Certification[] = [
  {
    name: 'Oracle Cloud Infrastructure 2025 Certified Multicloud Architect Professional',
    issuer: 'Oracle',
    dates: 'Issued Sep 2025 · valid to Sep 2027',
    claim: 'cert.oci-multicloud',
    verifyUrl:
      'https://catalog-education.oracle.com/ords/certview/sharebadge?id=9AF43CFD850C7439E6E919020DC2AD7218D2B8850C764836AD9262F4F9BABD93',
  },
  {
    name: 'Oracle Cloud Infrastructure 2025 Certified Generative AI Professional',
    issuer: 'Oracle',
    dates: 'Oct 2025',
    claim: 'cert.oci-genai',
    file: '/certificates/oci-2025-generative-ai-professional.webp',
  },
  {
    name: 'Data Science for Engineers',
    issuer: 'NPTEL · IIT Madras',
    dates: 'Jul–Sep 2024 · Elite',
    claim: 'cert.nptel-dse',
    file: '/certificates/nptel-data-science-for-engineers.pdf',
  },
];
