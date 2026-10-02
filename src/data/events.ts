import type { ImageMetadata } from 'astro';
import aws from '../assets/events/aws-summit-bengaluru-2026.jpg';
import iaf from '../assets/events/iaf-innovation-challenge-2025.jpg';

/**
 * Events & hackathons.
 * Building events first, then attending. Public facts cite a source claim; "did" lines are owner-confirmed.
 * No official links are invented where none were verified.
 */
export type EventItem = {
  name: string;
  when: string;
  where: string;
  what?: string;
  whatClaim?: string;
  did: string;
  didClaim: string;
  photo?: { src: ImageMetadata; alt: string };
};

export const events: EventItem[] = [
  {
    name: 'Portkey AI Builders Challenge',
    when: '17–18 Jan 2026',
    where: 'HSR Layout, Bengaluru',
    what: 'A hackathon for individual builders working on production AI systems, with a hiring track.',
    whatClaim: 'evt.portkey.public',
    did: 'Built a prompt-governance engine that groups equivalent prompts using embeddings and vector search, extracts a canonical template with typed slots for each group, and versions templates immutably.',
    didClaim: 'evt.portkey.owner',
    // Photo withheld: the photo supplied for this event shows Volvo branding.
  },
  {
    name: 'VOLVO DAY Hackathon 2024',
    when: '2024',
    where: 'Volvo Group, Bengaluru',
    did: 'Built a log-observability stack and a React website presenting the plant’s supply-chain and registry information, with models and their descriptions.',
    didClaim: 'evt.volvo',
  },
  {
    name: 'IAF Innovation Challenge 2025',
    when: '2025',
    where: 'Yelahanka, Bengaluru',
    did: 'Built a full-stack reactive website with a Docker-based monitoring stack.',
    didClaim: 'evt.iaf',
    photo: {
      src: iaf,
      alt: 'Utkarsh standing in front of large blue "Indian Air Force" lettering outside an exhibition pavilion.',
    },
  },
  {
    name: 'AWS Summit Bengaluru 2026',
    when: '22–23 Apr 2026',
    where: 'KTPO, Whitefield, Bengaluru',
    what: 'AWS’s annual Bengaluru summit, with innovator and technical editions on agentic AI, modernisation and cloud-native infrastructure.',
    whatClaim: 'evt.aws',
    did: 'Attended.',
    didClaim: 'evt.aws',
    photo: {
      src: aws,
      alt: 'Utkarsh at AWS Summit Bengaluru, in front of a "Turn ideas into impact" installation.',
    },
  },
  {
    name: 'Ather Community Day 2025',
    when: '30 Aug 2025',
    where: 'KTPO, Bengaluru',
    what: 'Ather Energy’s third Community Day, its annual technology and product showcase, and the first edition open to non-owners.',
    whatClaim: 'evt.ather',
    did: 'Attended.',
    didClaim: 'evt.ather',
  },
];
