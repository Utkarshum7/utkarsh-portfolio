import type { ImageMetadata } from 'astro';
import supportIntelligence from '../assets/projects/support-intelligence.png';
import robofleet from '../assets/projects/robofleet-monitor.png';
import apollo from '../assets/projects/apollo-family-clinic.png';
import appointments from '../assets/projects/appointment-board.png';

/**
 * Project visuals. Only real material: screenshots of the public demos (captured 2026-10-08 from the live sites,
 * signed out, no form submitted), the ScopeTrace architecture drawing, or a pipeline drawn from the case study.
 * Never a mock-up or an invented interface.
 */
export type Visual =
  | { kind: 'diagram'; caption: string }
  | { kind: 'pipeline'; caption: string }
  | { kind: 'screenshot'; image: ImageMetadata; alt: string; caption: string };

export const visuals: Record<string, Visual> = {
  scopetrace: { kind: 'diagram', caption: 'Architecture · every model call crosses the AI gateway' },
  'support-intelligence': {
    kind: 'screenshot',
    image: supportIntelligence,
    alt: 'The Delta Support Intelligence demo: a customer-message form with example queries beside an empty agent-analysis panel.',
    caption: 'Live demo · delta-support-intelligence-demo.onrender.com',
  },
  'resume-screener': {
    kind: 'pipeline',
    caption: 'One candidate’s path · the LLM step is the only non-deterministic one',
  },
  'robofleet-monitor': {
    kind: 'screenshot',
    image: robofleet,
    alt: 'RoboFleet Monitor replaying a recorded log: fleet totals, a site map with robots, and a robot list with status and battery.',
    caption: 'Live demo · synthetic data',
  },
  'apollo-family-clinic': {
    kind: 'screenshot',
    image: apollo,
    alt: 'The Apollo Family Clinic demo home page, with a sample exchange with its assistant.',
    caption: 'Live demo · fictional clinic',
  },
  'appointment-board': {
    kind: 'screenshot',
    image: appointments,
    alt: 'Appointment Board listing scheduled, completed and cancelled appointments as cards.',
    caption: 'Live demo · three-tier deployment',
  },
};
