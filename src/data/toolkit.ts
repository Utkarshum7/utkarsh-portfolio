/**
 * Engineering toolkit: each technology or technique, and where it was actually used.
 *
 * Evidence rules:
 *  - Every entry needs at least one use. A use is a public project on this site (linked), the owner-confirmed
 *    internship (described, because the employer's code is private), a verified certification, an owner-confirmed
 *    event, or this site itself.
 *  - Notes restate facts already published elsewhere on the site. No numbers, no proficiency levels, no years.
 *  - A tool with no publishable evidence is not listed, however familiar it is.
 * Project ids are checked against the content collection at build time (see Toolkit.astro).
 */
export type AreaId = 'backend' | 'ai' | 'cloud' | 'frontend';

export const AREAS: Record<AreaId, { label: string }> = {
  backend: { label: 'Backend' },
  ai: { label: 'AI systems' },
  cloud: { label: 'Cloud & DevOps' },
  frontend: { label: 'Front-end' },
};

export type Use =
  | { kind: 'project'; project: string; note: string }
  | { kind: 'experience'; note: string }
  | { kind: 'certification'; note: string }
  | { kind: 'event'; name: string; note: string }
  | { kind: 'site'; note: string };

export type Tech = {
  /** Stable id, used in /work?tech=<id> */
  id: string;
  name: string;
  /** Symbol id in src/assets/tech-marks.svg, or a short typographic mark when no suitable mark exists */
  mark: { icon: string } | { text: string };
  uses: Use[];
};

export type Discipline = {
  id: Exclude<AreaId, 'frontend'>;
  index: string;
  title: string;
  thesis: string;
  groups: { label: string; items: Tech[] }[];
};

export const disciplines: Discipline[] = [
  {
    id: 'backend',
    index: '01',
    title: 'Backend engineering',
    thesis: 'Services that store and move data carefully, and stay correct when requests race.',
    groups: [
      {
        label: 'Languages & frameworks',
        items: [
          {
            id: 'python',
            name: 'Python',
            mark: { icon: 'python' },
            uses: [
              {
                kind: 'project',
                project: 'scopetrace',
                note: 'Django services, Celery tasks and the AI gateway.',
              },
              { kind: 'project', project: 'support-intelligence', note: 'The agent and its evaluation.' },
              {
                kind: 'project',
                project: 'resume-screener',
                note: 'The whole pipeline, including every score.',
              },
              {
                kind: 'project',
                project: 'ai-investment-copilot',
                note: 'A service with a safety check and agent routing.',
              },
              { kind: 'experience', note: 'Automation for recurring diagnostics and operational tasks.' },
            ],
          },
          {
            id: 'django',
            name: 'Django and DRF',
            mark: { icon: 'django' },
            uses: [
              {
                kind: 'project',
                project: 'scopetrace',
                note: 'The API under gunicorn, with the approval workflow enforced at the model layer.',
              },
            ],
          },
          {
            id: 'fastapi',
            name: 'FastAPI',
            mark: { icon: 'fastapi' },
            uses: [
              {
                kind: 'project',
                project: 'appointment-board',
                note: 'The scheduling API, which prevents double bookings on the server.',
              },
              {
                kind: 'project',
                project: 'ai-investment-copilot',
                note: 'Answers streamed over server-sent events.',
              },
            ],
          },
          {
            id: 'node',
            name: 'Node.js and NestJS',
            mark: { icon: 'nodedotjs' },
            uses: [
              {
                kind: 'project',
                project: 'taskora',
                note: "An API that scopes tasks per user and returns 404 for anyone else's.",
              },
            ],
          },
        ],
      },
      {
        label: 'Data & queues',
        items: [
          {
            id: 'postgresql',
            name: 'PostgreSQL',
            mark: { icon: 'postgresql' },
            uses: [
              {
                kind: 'project',
                project: 'scopetrace',
                note: 'Records, the hash-chained audit log, and the row locks that keep AI budgets correct.',
              },
              { kind: 'project', project: 'appointment-board', note: 'The scheduling database.' },
            ],
          },
          {
            id: 'celery',
            name: 'Celery',
            mark: { icon: 'celery' },
            uses: [
              {
                kind: 'project',
                project: 'scopetrace',
                note: 'Parsing and calculation as background tasks on dedicated queues.',
              },
            ],
          },
          {
            id: 'redis',
            name: 'Redis',
            mark: { icon: 'redis' },
            uses: [{ kind: 'project', project: 'scopetrace', note: 'Celery broker and cache.' }],
          },
        ],
      },
      {
        label: 'Correctness',
        items: [
          {
            id: 'concurrency',
            name: 'Concurrency and idempotency',
            mark: { text: 'TXN' },
            uses: [
              {
                kind: 'project',
                project: 'scopetrace',
                note: 'Row locks, and multi-threaded tests that a budget holds and a duplicate is never paid twice.',
              },
              {
                kind: 'project',
                project: 'appointment-board',
                note: 'Double bookings prevented on the server, not just in the form.',
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'ai',
    index: '02',
    title: 'AI systems',
    thesis:
      'Models do the parts that need language or judgement; deterministic code decides, and an evaluation says whether it works.',
    groups: [
      {
        label: 'Building with models',
        items: [
          {
            id: 'llm',
            name: 'LLM integration',
            mark: { text: 'LLM' },
            uses: [
              {
                kind: 'project',
                project: 'scopetrace',
                note: 'Five advisory features behind one gateway: Anthropic, OpenAI or a deterministic demo provider.',
              },
              {
                kind: 'project',
                project: 'resume-screener',
                note: 'Gemini classifies how substantial each project is, once per eligible candidate.',
              },
            ],
          },
          {
            id: 'pydantic',
            name: 'Pydantic',
            mark: { icon: 'pydantic' },
            uses: [
              {
                kind: 'project',
                project: 'resume-screener',
                note: 'LLM answers must validate against a schema; a failure falls back to Python scoring.',
              },
            ],
          },
          {
            id: 'retrieval',
            name: 'Retrieval and vector search',
            mark: { text: 'VEC' },
            uses: [
              {
                kind: 'project',
                project: 'support-intelligence',
                note: 'TF-IDF retrieval over past answers, built from the development split only.',
              },
              {
                kind: 'event',
                name: 'Portkey AI Builders Challenge',
                note: 'Grouped equivalent prompts using embeddings and vector search.',
              },
            ],
          },
          {
            id: 'scikit-learn',
            name: 'scikit-learn',
            mark: { icon: 'scikitlearn' },
            uses: [
              {
                kind: 'project',
                project: 'support-intelligence',
                note: 'TF-IDF features and logistic regression for intent classification.',
              },
            ],
          },
        ],
      },
      {
        label: 'Evaluation & safety',
        items: [
          {
            id: 'evaluation',
            name: 'Evaluation',
            mark: { text: 'EVAL' },
            uses: [
              {
                kind: 'project',
                project: 'support-intelligence',
                note: 'A leakage-safe split, two baselines and a human-reviewed golden set.',
              },
              {
                kind: 'project',
                project: 'scopetrace',
                note: 'A golden dataset per AI feature, and a test that each feature leaves records unchanged.',
              },
            ],
          },
          {
            id: 'guardrails',
            name: 'Guardrails',
            mark: { text: 'GATE' },
            uses: [
              {
                kind: 'project',
                project: 'scopetrace',
                note: 'Policy, budget and data-egress checks before every model call.',
              },
              {
                kind: 'project',
                project: 'support-intelligence',
                note: 'Escalation to a person is deterministic rules, not a model.',
              },
              {
                kind: 'project',
                project: 'ai-investment-copilot',
                note: 'A safety check runs before anything else.',
              },
              {
                kind: 'project',
                project: 'apollo-family-clinic',
                note: 'An assistant that declines to give medical advice.',
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'cloud',
    index: '03',
    title: 'Cloud & DevOps',
    thesis: 'Infrastructure that is repeatable and observable, and systems someone else could run.',
    groups: [
      {
        label: 'Cloud',
        items: [
          {
            id: 'aws',
            name: 'AWS',
            mark: { text: 'AWS' },
            uses: [
              {
                kind: 'experience',
                note: 'Diagnosed and fixed production issues on AWS-hosted backend APIs from their logs.',
              },
            ],
          },
          {
            id: 'gcp',
            name: 'Google Cloud',
            mark: { icon: 'googlecloud' },
            uses: [
              {
                kind: 'experience',
                note: 'Diagnosed and fixed production issues on GCP-hosted backend APIs from their logs.',
              },
            ],
          },
          {
            id: 'oci',
            name: 'Oracle Cloud',
            mark: { text: 'OCI' },
            uses: [
              { kind: 'certification', note: 'OCI 2025 Certified Multicloud Architect Professional.' },
              { kind: 'certification', note: 'OCI 2025 Certified Generative AI Professional.' },
            ],
          },
        ],
      },
      {
        label: 'Delivery',
        items: [
          {
            id: 'docker',
            name: 'Docker',
            mark: { icon: 'docker' },
            uses: [
              { kind: 'experience', note: 'Deployed and maintained containerised backend services.' },
              {
                kind: 'project',
                project: 'scopetrace',
                note: 'The full topology in Docker Compose, and an image build on every push.',
              },
              {
                kind: 'project',
                project: 'edge-observability-stack',
                note: 'A monitoring stack held to fixed memory limits.',
              },
              {
                kind: 'project',
                project: 'docker-monitoring-stack',
                note: 'Monitoring for Docker hosts and containers.',
              },
              { kind: 'project', project: 'k8s-notes-app-deployment', note: 'The image for the app.' },
              { kind: 'project', project: 'vyasas-vision', note: 'A containerised static site.' },
              {
                kind: 'event',
                name: 'IAF Innovation Challenge 2025',
                note: 'A Docker-based monitoring stack.',
              },
            ],
          },
          {
            id: 'kubernetes',
            name: 'Kubernetes',
            mark: { icon: 'kubernetes' },
            uses: [
              { kind: 'experience', note: 'Deployed and maintained containerised services on Kubernetes.' },
              {
                kind: 'project',
                project: 'k8s-notes-app-deployment',
                note: 'Kubernetes manifests for a small Django app.',
              },
            ],
          },
          {
            id: 'terraform',
            name: 'Terraform',
            mark: { icon: 'terraform' },
            uses: [{ kind: 'experience', note: 'Repeatable, reversible infrastructure.' }],
          },
          {
            id: 'github-actions',
            name: 'GitHub Actions',
            mark: { icon: 'githubactions' },
            uses: [
              {
                kind: 'project',
                project: 'scopetrace',
                note: 'Four workflows on every push: backend, frontend, image build and a secret scan.',
              },
              { kind: 'experience', note: 'CI/CD workflows for containerised services.' },
              {
                kind: 'site',
                note: 'Build, browser tests, accessibility checks and Lighthouse on every change.',
              },
            ],
          },
          {
            id: 'paas',
            name: 'Managed platforms',
            mark: { text: 'PaaS' },
            uses: [
              {
                kind: 'project',
                project: 'scopetrace',
                note: 'Web app on Vercel; API and database on Northflank.',
              },
              { kind: 'project', project: 'support-intelligence', note: 'Demo on a free Render instance.' },
              {
                kind: 'project',
                project: 'appointment-board',
                note: 'Three tiers: front end, API and database on separate hosts.',
              },
              { kind: 'site', note: 'Static build deployed to Vercel.' },
            ],
          },
        ],
      },
      {
        label: 'Observability',
        items: [
          {
            id: 'prometheus',
            name: 'Prometheus and Grafana',
            mark: { icon: 'prometheus' },
            uses: [
              { kind: 'experience', note: 'Service monitoring and reliability tracking.' },
              {
                kind: 'project',
                project: 'docker-monitoring-stack',
                note: 'With Alertmanager, cAdvisor, node-exporter and provisioned dashboards.',
              },
            ],
          },
          {
            id: 'victoriametrics',
            name: 'VictoriaMetrics',
            mark: { icon: 'victoriametrics' },
            uses: [
              {
                kind: 'project',
                project: 'edge-observability-stack',
                note: 'Metrics for an edge service, within a fixed memory limit.',
              },
            ],
          },
          {
            id: 'health',
            name: 'Health checks and request IDs',
            mark: { text: 'OPS' },
            uses: [
              {
                kind: 'project',
                project: 'scopetrace',
                note: 'Health endpoints for the database, workers and AI layer; a correlation ID on every request.',
              },
            ],
          },
        ],
      },
    ],
  },
];

/** Secondary row: tools used around the systems above. */
export const frontendAndTooling: Tech[] = [
  {
    id: 'react',
    name: 'React',
    mark: { icon: 'react' },
    uses: [
      { kind: 'project', project: 'scopetrace', note: 'The web app.' },
      {
        kind: 'project',
        project: 'robofleet-monitor',
        note: 'A replay and a live feed through one reducer.',
      },
      { kind: 'project', project: 'appointment-board', note: 'The booking front end.' },
      { kind: 'project', project: 'apollo-family-clinic', note: 'An accessible four-step booking form.' },
    ],
  },
  {
    id: 'typescript',
    name: 'TypeScript',
    mark: { icon: 'typescript' },
    uses: [
      { kind: 'project', project: 'robofleet-monitor', note: 'The dashboard and its validation pipeline.' },
      { kind: 'project', project: 'apollo-family-clinic', note: 'The site and its form validation.' },
      { kind: 'site', note: 'Strict mode throughout.' },
    ],
  },
  {
    id: 'react-native',
    name: 'React Native',
    mark: { text: 'RN' },
    uses: [{ kind: 'project', project: 'taskora', note: 'An Android app with secure token storage.' }],
  },
  {
    id: 'vite',
    name: 'Vite',
    mark: { icon: 'vite' },
    uses: [{ kind: 'project', project: 'scopetrace', note: "The web app's build." }],
  },
  {
    id: 'astro',
    name: 'Astro',
    mark: { icon: 'astro' },
    uses: [{ kind: 'site', note: 'Static HTML with no client framework.' }],
  },
  {
    id: 'playwright',
    name: 'Playwright and axe',
    mark: { text: 'E2E' },
    uses: [
      {
        kind: 'site',
        note: 'Every page at three widths, in both themes, with automated accessibility checks.',
      },
    ],
  },
];

/** Every technology, for lookups such as the /work?tech= filter. */
export const allTech: Tech[] = [
  ...disciplines.flatMap((d) => d.groups.flatMap((g) => g.items)),
  ...frontendAndTooling,
];

/** Project id → ids of the technologies it uses, derived from the toolkit (single source). */
export function techByProject(): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const t of allTech)
    for (const u of t.uses)
      if (u.kind === 'project') map.set(u.project, [...new Set([...(map.get(u.project) ?? []), t.id])]);
  return map;
}
