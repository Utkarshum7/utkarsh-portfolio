/**
 * Site-wide identity facts. Every value here is owner-confirmed or verified. Nothing is taken from the résumé.
 */
export const profile = {
  name: 'Utkarsh Amaresh',
  roleLine: 'Backend engineer · Python · AI systems',
  statement:
    'I build backend systems where AI assists and deterministic code decides, and I measure whether it works.',
  location: 'Bengaluru, India',
  education: 'B.E., RV College of Engineering, 2026',
  availability: 'Available immediately',
  email: 'utkarshjsr7@gmail.com',
  github: 'https://github.com/Utkarshum7',
  linkedin: 'https://www.linkedin.com/in/utkarshamaresh/',
  /** Set to '/resume.pdf' only once the corrected résumé is supplied. */
  resume: null as string | null,
} as const;
