/**
 * Seed data definitions for the development environment.
 *
 * Contains realistic names, descriptions, and configurations for all
 * entities in the work hierarchy. Separated from the seed orchestration
 * script to keep each file focused and under 200 lines.
 */

// ---------------------------------------------------------------------------
// Personas
// ---------------------------------------------------------------------------

export const PERSONA_DEFINITIONS = [
  {
    name: 'Backend Developer',
    description:
      'Specializes in server-side application logic, REST API design, database interactions, ' +
      'and service integration. Proficient in Node.js, TypeScript, and SQL. Handles authentication, ' +
      'authorization, data validation, and business rule enforcement.',
    systemPrompt:
      'You are a backend developer. Focus on server-side logic, API design, database operations, ' +
      'and service integration using Node.js, TypeScript, and SQL.',
  },
  {
    name: 'Frontend Developer',
    description:
      'Builds responsive user interfaces with React, TypeScript, and modern CSS. Focuses on ' +
      'component architecture, state management, accessibility (WCAG 2.1 AA), and performance ' +
      'optimization. Implements design system tokens and interactive UI patterns.',
    systemPrompt:
      'You are a frontend developer. Focus on building responsive UIs with React, TypeScript, ' +
      'and modern CSS, following accessibility and performance best practices.',
  },
  {
    name: 'QA Engineer',
    description:
      'Designs and executes test strategies including unit, integration, and end-to-end tests. ' +
      'Writes automated test suites using Vitest and Playwright. Performs exploratory testing, ' +
      'regression analysis, and documents test plans with traceability matrices.',
    systemPrompt:
      'You are a QA engineer. Focus on designing test strategies, writing automated tests with ' +
      'Vitest and Playwright, and ensuring comprehensive test coverage.',
  },
  {
    name: 'Database Administrator',
    description:
      'Manages PostgreSQL schema design, migration authoring, query optimization, and indexing ' +
      'strategies. Monitors query performance, configures connection pooling, and ensures data ' +
      'integrity through constraints and proper normalization.',
    systemPrompt:
      'You are a database administrator. Focus on PostgreSQL schema design, migration authoring, ' +
      'query optimization, indexing strategies, and data integrity.',
  },
  {
    name: 'DevOps Engineer',
    description:
      'Manages CI/CD pipelines, infrastructure-as-code with Terraform, container orchestration, ' +
      'and cloud deployments on AWS. Configures monitoring, alerting, log aggregation, and ' +
      'implements zero-downtime deployment strategies.',
    systemPrompt:
      'You are a DevOps engineer. Focus on CI/CD pipelines, infrastructure-as-code with Terraform, ' +
      'container orchestration, and AWS cloud deployments.',
  },
  {
    name: 'Security Engineer',
    description:
      'Conducts security audits, penetration testing, and vulnerability assessments. Implements ' +
      'OWASP best practices, manages secrets rotation, configures WAF rules, and ensures ' +
      'compliance with SOC 2 and GDPR requirements.',
    systemPrompt:
      'You are a security engineer. Focus on security audits, vulnerability assessments, OWASP ' +
      'best practices, and compliance with SOC 2 and GDPR requirements.',
  },
] as const;

// ---------------------------------------------------------------------------
// Worker definitions
// ---------------------------------------------------------------------------

export const WORKER_DEFINITIONS = [
  {
    name: 'worker-alpha',
    description:
      'Primary development worker handling backend and database tasks. ' +
      'Optimized for Node.js and PostgreSQL workloads.',
  },
  {
    name: 'worker-beta',
    description:
      'Frontend-focused worker specializing in React component development ' +
      'and UI testing automation.',
  },
  {
    name: 'worker-gamma',
    description:
      'Infrastructure and DevOps worker managing deployments, CI/CD pipelines, ' +
      'and cloud resource provisioning.',
  },
] as const;

// ---------------------------------------------------------------------------
// Project hierarchy configurations
// ---------------------------------------------------------------------------

export interface StoryConfig {
  title: string;
  description: string;
  priority: string;
  workStatus: string;
  /** Whether this story should be assigned to a worker */
  assigned?: boolean;
  /** Whether this story has attempt history (failed attempt) */
  hasAttemptHistory?: boolean;
  tasks: TaskConfig[];
}

export interface TaskConfig {
  title: string;
  description: string;
  acceptanceCriteria: string[];
  technicalNotes: string;
  /** Index into PERSONA_DEFINITIONS */
  personaIndex: number;
  workStatus: string;
}

export interface EpicConfig {
  name: string;
  description: string;
  workStatus: string;
  stories: StoryConfig[];
}

export interface ProjectConfig {
  name: string;
  description: string;
  lifecycleStatus: string;
  workStatus: string;
  /** Indices into WORKER_DEFINITIONS for project access grants */
  workerAccessIndices: number[];
  epics: EpicConfig[];
}

export const PROJECT_CONFIGS: ProjectConfig[] = [
  // -------------------------------------------------------------------------
  // Project 1: Active project with mixed statuses
  // -------------------------------------------------------------------------
  {
    name: 'E-Commerce Platform Redesign',
    description:
      'Complete redesign of the customer-facing e-commerce experience with modern UI patterns, ' +
      'improved checkout flow, and real-time inventory management. Targets 40% improvement in ' +
      'conversion rate and sub-2s page load times.',
    lifecycleStatus: 'active',
    workStatus: 'in_progress',
    workerAccessIndices: [0, 1],
    epics: [
      {
        name: 'Product Catalog Overhaul',
        description: 'Redesign product browsing, search, and filtering with faceted navigation.',
        workStatus: 'in_progress',
        stories: [
          {
            title: 'Implement faceted search API',
            description:
              'Build a search endpoint supporting multi-facet filtering with Elasticsearch.',
            priority: 'high',
            workStatus: 'done',
            tasks: [
              {
                title: 'Design search index schema',
                description:
                  'Define Elasticsearch index mappings for product attributes and facets.',
                acceptanceCriteria: [
                  'Index supports nested facet fields',
                  'Mapping includes all product attributes',
                ],
                technicalNotes: 'Use dynamic templates for extensible facet definitions.',
                personaIndex: 0,
                workStatus: 'done',
              },
              {
                title: 'Implement search query builder',
                description:
                  'Create a composable query builder that translates filter parameters into ES queries.',
                acceptanceCriteria: [
                  'Supports AND/OR filter combinations',
                  'Handles price range filters',
                  'Returns facet counts',
                ],
                technicalNotes: 'Use the bool query with must/should clauses for filter logic.',
                personaIndex: 0,
                workStatus: 'done',
              },
              {
                title: 'Add search results pagination',
                description:
                  'Implement cursor-based pagination for search results with consistent ordering.',
                acceptanceCriteria: [
                  'Cursor-based pagination works correctly',
                  'Results are deterministically ordered',
                ],
                technicalNotes: 'Use search_after for deep pagination to avoid the 10k hit limit.',
                personaIndex: 0,
                workStatus: 'done',
              },
            ],
          },
          {
            title: 'Build product grid component',
            description: 'Create a responsive product grid with lazy loading and skeleton states.',
            priority: 'medium',
            workStatus: 'in_progress',
            assigned: true,
            tasks: [
              {
                title: 'Create ProductCard component',
                description:
                  'Build an accessible card component displaying product image, title, price, and rating.',
                acceptanceCriteria: [
                  'Renders product data correctly',
                  'Meets WCAG 2.1 AA contrast requirements',
                  'Supports keyboard navigation',
                ],
                technicalNotes: 'Use Next.js Image component for optimized image loading.',
                personaIndex: 1,
                workStatus: 'in_progress',
              },
              {
                title: 'Implement virtual scrolling',
                description:
                  'Add windowed rendering for large product lists to maintain 60fps scroll performance.',
                acceptanceCriteria: [
                  'Renders 10k+ items without frame drops',
                  'Maintains scroll position on filter changes',
                ],
                technicalNotes:
                  'Evaluate react-window vs @tanstack/virtual for the windowing implementation.',
                personaIndex: 1,
                workStatus: 'pending',
              },
            ],
          },
          {
            title: 'Write search integration tests',
            description: 'Create comprehensive integration test suite for the search API.',
            priority: 'medium',
            workStatus: 'ready',
            tasks: [
              {
                title: 'Set up search test fixtures',
                description:
                  'Create realistic product data fixtures for search integration testing.',
                acceptanceCriteria: [
                  'Fixtures cover all product categories',
                  'Includes edge cases (empty fields, special characters)',
                ],
                technicalNotes: 'Use factory pattern for generating test products.',
                personaIndex: 2,
                workStatus: 'pending',
              },
              {
                title: 'Write facet filtering tests',
                description:
                  'Test all filter combinations including multi-select, range, and boolean facets.',
                acceptanceCriteria: [
                  'All facet types tested',
                  'Combination filters verified',
                  'Empty result sets handled',
                ],
                technicalNotes: 'Parametrize tests using Vitest test.each for filter combinations.',
                personaIndex: 2,
                workStatus: 'pending',
              },
              {
                title: 'Write pagination boundary tests',
                description:
                  'Verify cursor pagination behavior at boundaries and with concurrent modifications.',
                acceptanceCriteria: [
                  'First page returns correct cursor',
                  'Last page signals end-of-results',
                  'Concurrent inserts do not skip items',
                ],
                technicalNotes: 'Use transactional test isolation to control data timing.',
                personaIndex: 2,
                workStatus: 'pending',
              },
            ],
          },
        ],
      },
      {
        name: 'Checkout Flow Optimization',
        description:
          'Streamline the checkout process from cart to confirmation in 3 steps or fewer.',
        workStatus: 'pending',
        stories: [
          {
            title: 'Design single-page checkout layout',
            description:
              'Create a consolidated checkout form with address, payment, and order summary sections.',
            priority: 'critical',
            workStatus: 'pending',
            tasks: [
              {
                title: 'Build checkout form components',
                description:
                  'Create reusable form components for shipping address, billing, and payment method entry.',
                acceptanceCriteria: [
                  'All form fields validate on blur',
                  'Address autocomplete integrated',
                  'Payment fields use PCI-compliant iframe',
                ],
                technicalNotes: 'Use React Hook Form with Zod validation schemas.',
                personaIndex: 1,
                workStatus: 'pending',
              },
              {
                title: 'Implement order summary sidebar',
                description:
                  'Build a sticky order summary component showing line items, tax, shipping, and total.',
                acceptanceCriteria: [
                  'Updates in real-time as cart changes',
                  'Shows estimated delivery date',
                  'Handles discount codes',
                ],
                technicalNotes: 'Use server actions for real-time price recalculation.',
                personaIndex: 1,
                workStatus: 'pending',
              },
            ],
          },
          {
            title: 'Implement payment processing API',
            description:
              'Create a secure payment processing endpoint supporting Stripe and PayPal.',
            priority: 'critical',
            workStatus: 'pending',
            tasks: [
              {
                title: 'Integrate Stripe payment intents',
                description:
                  'Implement server-side Stripe payment intent creation and confirmation flow.',
                acceptanceCriteria: [
                  'Creates payment intents correctly',
                  'Handles 3D Secure authentication',
                  'Idempotency keys prevent double charges',
                ],
                technicalNotes: 'Use Stripe API v2024-06 with automatic payment methods enabled.',
                personaIndex: 0,
                workStatus: 'pending',
              },
              {
                title: 'Add payment webhook handler',
                description:
                  'Process Stripe webhook events for payment confirmation and failure handling.',
                acceptanceCriteria: [
                  'Verifies webhook signatures',
                  'Handles payment_intent.succeeded',
                  'Handles payment_intent.payment_failed',
                  'Idempotent event processing',
                ],
                technicalNotes: 'Store processed event IDs in a deduplication table with 72h TTL.',
                personaIndex: 0,
                workStatus: 'pending',
              },
              {
                title: 'Write payment security audit checklist',
                description:
                  'Document and verify PCI DSS compliance requirements for the payment flow.',
                acceptanceCriteria: [
                  'No raw card data touches our servers',
                  'TLS 1.2+ enforced',
                  'Audit log captures all payment events',
                ],
                technicalNotes: 'Reference PCI DSS v4.0 SAQ A-EP requirements.',
                personaIndex: 5,
                workStatus: 'pending',
              },
            ],
          },
          {
            title: 'Build order confirmation and email receipt',
            description:
              'Create the post-purchase confirmation page and trigger transactional email receipts.',
            priority: 'high',
            workStatus: 'pending',
            tasks: [
              {
                title: 'Design order confirmation page',
                description:
                  'Build a confirmation page showing order number, estimated delivery, and next steps.',
                acceptanceCriteria: [
                  'Displays order number prominently',
                  'Shows estimated delivery window',
                  'Includes print-friendly layout',
                ],
                technicalNotes: 'Use server-side rendering for immediate display after redirect.',
                personaIndex: 1,
                workStatus: 'pending',
              },
              {
                title: 'Implement transactional email service',
                description:
                  'Send order confirmation emails with line items, totals, and tracking information.',
                acceptanceCriteria: [
                  'Email sent within 30s of order completion',
                  'Includes all line items and totals',
                  'Renders correctly in major email clients',
                ],
                technicalNotes: 'Use React Email with Resend for template rendering and delivery.',
                personaIndex: 0,
                workStatus: 'pending',
              },
              {
                title: 'Write order confirmation integration tests',
                description:
                  'Verify end-to-end flow from payment success to confirmation page and email dispatch.',
                acceptanceCriteria: [
                  'Tests payment success callback',
                  'Verifies email queued correctly',
                  'Tests idempotent confirmation rendering',
                ],
                technicalNotes: 'Mock email service in tests; verify payload structure.',
                personaIndex: 2,
                workStatus: 'pending',
              },
            ],
          },
        ],
      },
      {
        name: 'Performance Monitoring',
        description:
          'Instrument the application with real-user monitoring and synthetic performance checks.',
        workStatus: 'in_progress',
        stories: [
          {
            title: 'Set up Core Web Vitals tracking',
            description: 'Implement client-side collection of LCP, FID, CLS, and TTFB metrics.',
            priority: 'high',
            workStatus: 'in_progress',
            assigned: true,
            hasAttemptHistory: true,
            tasks: [
              {
                title: 'Integrate web-vitals library',
                description:
                  'Add the web-vitals library and configure metric collection with custom attribution.',
                acceptanceCriteria: [
                  'All CWV metrics collected',
                  'Attribution data identifies slow components',
                  'Metrics batched and sent every 10s',
                ],
                technicalNotes: 'Use web-vitals v4 with attribution build for detailed breakdowns.',
                personaIndex: 1,
                workStatus: 'in_progress',
              },
              {
                title: 'Create metrics ingestion endpoint',
                description:
                  'Build a lightweight API endpoint to receive and store client performance metrics.',
                acceptanceCriteria: [
                  'Accepts batched metric payloads',
                  'Validates metric schema',
                  'Stores in time-series format',
                ],
                technicalNotes:
                  'Use a write-optimized table with TimescaleDB hypertable or partitioned by day.',
                personaIndex: 0,
                workStatus: 'pending',
              },
            ],
          },
          {
            title: 'Configure synthetic monitoring alerts',
            description:
              'Set up automated synthetic checks that probe critical user flows and trigger PagerDuty alerts on degradation.',
            priority: 'medium',
            workStatus: 'failed',
            assigned: true,
            hasAttemptHistory: false,
            tasks: [
              {
                title: 'Define synthetic check scenarios',
                description:
                  'Author Playwright scripts for homepage load, search, and checkout synthetic probes.',
                acceptanceCriteria: [
                  'Covers 3 critical user flows',
                  'Runs in under 30 seconds',
                  'Reports detailed timing breakdowns',
                ],
                technicalNotes:
                  'Use Playwright test runner with custom reporter for metrics extraction.',
                personaIndex: 2,
                workStatus: 'pending',
              },
              {
                title: 'Integrate PagerDuty alerting',
                description:
                  'Connect synthetic check failures to PagerDuty for on-call escalation.',
                acceptanceCriteria: [
                  'Alerts fire within 60s of threshold breach',
                  'Includes runbook link',
                  'Respects maintenance windows',
                ],
                technicalNotes: 'Use PagerDuty Events API v2 with deduplication keys.',
                personaIndex: 4,
                workStatus: 'pending',
              },
            ],
          },
          {
            title: 'Build performance analytics dashboard',
            description:
              'Create an internal dashboard visualizing Core Web Vitals trends and p95 latency distributions.',
            priority: 'low',
            workStatus: 'pending',
            tasks: [
              {
                title: 'Design dashboard data aggregation queries',
                description:
                  'Write time-bucketed aggregation queries for CWV metrics with percentile calculations.',
                acceptanceCriteria: [
                  'Supports hourly, daily, and weekly rollups',
                  'Calculates p50, p75, and p95 percentiles',
                  'Queries complete under 500ms on 30-day range',
                ],
                technicalNotes:
                  'Use PostgreSQL percentile_cont window functions with materialized views for hot paths.',
                personaIndex: 3,
                workStatus: 'pending',
              },
              {
                title: 'Implement dashboard UI with time-series charts',
                description:
                  'Build React dashboard page with interactive line charts and date range selectors.',
                acceptanceCriteria: [
                  'Charts render CWV trends over time',
                  'Date range picker with presets',
                  'Responsive layout for tablet and desktop',
                ],
                technicalNotes:
                  'Use Recharts for charting with custom tooltips showing exact percentile values.',
                personaIndex: 1,
                workStatus: 'pending',
              },
            ],
          },
        ],
      },
    ],
  },

  // -------------------------------------------------------------------------
  // Project 2: Completed project
  // -------------------------------------------------------------------------
  {
    name: 'API Gateway Migration',
    description:
      'Migrate from the monolithic Express API to a microservices architecture behind an API ' +
      'gateway. Decompose domain services, implement service discovery, and add circuit breaker ' +
      'patterns for resilience.',
    lifecycleStatus: 'completed',
    workStatus: 'done',
    workerAccessIndices: [0, 2],
    epics: [
      {
        name: 'Service Decomposition',
        description:
          'Extract bounded contexts from the monolith into independently deployable services.',
        workStatus: 'done',
        stories: [
          {
            title: 'Extract user service',
            description:
              'Move user management (CRUD, profile, preferences) into a standalone service.',
            priority: 'high',
            workStatus: 'done',
            tasks: [
              {
                title: 'Define user service API contract',
                description: 'Create OpenAPI 3.1 specification for the user service endpoints.',
                acceptanceCriteria: [
                  'All CRUD endpoints documented',
                  'Request/response schemas defined',
                  'Error responses standardized',
                ],
                technicalNotes: 'Use @asteasolutions/zod-to-openapi for schema generation.',
                personaIndex: 0,
                workStatus: 'done',
              },
              {
                title: 'Implement user service database migration',
                description:
                  'Create Drizzle migration to move user tables to the service-specific schema.',
                acceptanceCriteria: [
                  'Migration runs without data loss',
                  'Foreign key references updated',
                  'Rollback migration verified',
                ],
                technicalNotes: 'Use pg_dump --schema-only for initial schema extraction.',
                personaIndex: 3,
                workStatus: 'done',
              },
              {
                title: 'Write user service integration tests',
                description: 'Create API-level integration tests for all user service endpoints.',
                acceptanceCriteria: [
                  'All endpoints have happy-path tests',
                  'Error scenarios covered',
                  'Auth middleware tested',
                ],
                technicalNotes: 'Use supertest with in-memory test database.',
                personaIndex: 2,
                workStatus: 'done',
              },
            ],
          },
          {
            title: 'Extract notification service',
            description:
              'Move email, SMS, and push notification logic into an event-driven service.',
            priority: 'medium',
            workStatus: 'done',
            tasks: [
              {
                title: 'Design notification event schema',
                description:
                  'Define the event payload schema for notification triggers across services.',
                acceptanceCriteria: [
                  'Schema supports email, SMS, and push channels',
                  'Includes template references',
                  'Priority levels defined',
                ],
                technicalNotes: 'Use CloudEvents specification for event envelope format.',
                personaIndex: 0,
                workStatus: 'done',
              },
              {
                title: 'Implement notification delivery pipeline',
                description:
                  'Build the message processing pipeline with channel-specific delivery adapters.',
                acceptanceCriteria: [
                  'Supports all three channels',
                  'Retry with exponential backoff',
                  'Dead letter queue for failures',
                ],
                technicalNotes: 'Use AWS SQS with DLQ configured for at-least-once delivery.',
                personaIndex: 0,
                workStatus: 'done',
              },
            ],
          },
          {
            title: 'Extract product catalog service',
            description:
              'Move product listing, search, and inventory queries into a dedicated catalog service.',
            priority: 'high',
            workStatus: 'done',
            tasks: [
              {
                title: 'Define catalog service API contract',
                description:
                  'Create OpenAPI specification for product CRUD, search, and inventory endpoints.',
                acceptanceCriteria: [
                  'All product endpoints documented',
                  'Search query parameters defined',
                  'Inventory sync webhook specified',
                ],
                technicalNotes: 'Include bulk import endpoint for initial catalog migration.',
                personaIndex: 0,
                workStatus: 'done',
              },
              {
                title: 'Implement catalog data migration script',
                description:
                  'Write a migration script to move product data from the monolith to the catalog service database.',
                acceptanceCriteria: [
                  'Migrates all product records without loss',
                  'Handles image URL remapping',
                  'Runs in under 10 minutes for 100k products',
                ],
                technicalNotes: 'Use streaming cursor to avoid memory issues on large datasets.',
                personaIndex: 3,
                workStatus: 'done',
              },
            ],
          },
        ],
      },
      {
        name: 'Gateway Configuration',
        description: 'Deploy and configure the API gateway with routing, rate limiting, and auth.',
        workStatus: 'done',
        stories: [
          {
            title: 'Configure gateway routing rules',
            description: 'Set up path-based routing from the gateway to downstream microservices.',
            priority: 'critical',
            workStatus: 'done',
            tasks: [
              {
                title: 'Define service route mappings',
                description:
                  'Create route configuration mapping URL paths to backend service endpoints.',
                acceptanceCriteria: [
                  'All services routable',
                  'Path rewriting configured',
                  'Health check endpoints excluded from auth',
                ],
                technicalNotes: 'Use AWS API Gateway with OpenAPI import for route definitions.',
                personaIndex: 4,
                workStatus: 'done',
              },
              {
                title: 'Implement rate limiting policies',
                description:
                  'Configure per-client and per-endpoint rate limits with sliding window counters.',
                acceptanceCriteria: [
                  'Global rate limit of 1000 req/min',
                  'Per-endpoint overrides supported',
                  'Rate limit headers returned',
                ],
                technicalNotes:
                  'Use Redis-backed sliding window counter for distributed rate limiting.',
                personaIndex: 4,
                workStatus: 'done',
              },
            ],
          },
          {
            title: 'Set up circuit breaker patterns',
            description:
              'Add circuit breakers between the gateway and backend services for fault isolation.',
            priority: 'high',
            workStatus: 'done',
            tasks: [
              {
                title: 'Configure circuit breaker thresholds',
                description:
                  'Define failure rate thresholds and recovery timeouts for each downstream service.',
                acceptanceCriteria: [
                  'Opens after 50% failure rate in 30s window',
                  'Half-open after 10s',
                  'Closes after 5 successful probes',
                ],
                technicalNotes:
                  'Use cockatiel library for circuit breaker implementation in Node.js.',
                personaIndex: 0,
                workStatus: 'done',
              },
              {
                title: 'Add fallback response handlers',
                description: 'Implement graceful degradation responses when circuits are open.',
                acceptanceCriteria: [
                  'Returns cached data when available',
                  'Returns 503 with retry-after header',
                  'Logs circuit state transitions',
                ],
                technicalNotes:
                  'Use stale-while-revalidate caching pattern for degraded responses.',
                personaIndex: 0,
                workStatus: 'done',
              },
            ],
          },
          {
            title: 'Implement API versioning strategy',
            description:
              'Add URL-based API versioning to the gateway with backward-compatible routing.',
            priority: 'medium',
            workStatus: 'done',
            tasks: [
              {
                title: 'Configure version-aware routing rules',
                description:
                  'Set up /v1/ and /v2/ path prefixes that route to corresponding service versions.',
                acceptanceCriteria: [
                  'Requests to /v1/ route to legacy handlers',
                  'Requests to /v2/ route to new handlers',
                  'Unversioned requests default to latest stable version',
                ],
                technicalNotes:
                  'Use path rewriting to strip version prefix before forwarding to services.',
                personaIndex: 4,
                workStatus: 'done',
              },
              {
                title: 'Add API deprecation headers',
                description:
                  'Return Sunset and Deprecation headers on v1 endpoints to signal migration timeline.',
                acceptanceCriteria: [
                  'Sunset header includes retirement date',
                  'Deprecation header follows RFC 8594',
                  'Response includes Link header to v2 docs',
                ],
                technicalNotes:
                  'Implement as gateway middleware to avoid per-service configuration.',
                personaIndex: 0,
                workStatus: 'done',
              },
            ],
          },
        ],
      },
    ],
  },

  // -------------------------------------------------------------------------
  // Project 3: Draft project (planning phase)
  // -------------------------------------------------------------------------
  {
    name: 'Mobile App MVP',
    description:
      'First version of the native mobile application for iOS and Android using React Native. ' +
      'Core features include product browsing, user authentication, order tracking, and push ' +
      'notifications. Targeting App Store and Google Play launch within Q3.',
    lifecycleStatus: 'draft',
    workStatus: 'pending',
    workerAccessIndices: [1],
    epics: [
      {
        name: 'Authentication Flow',
        description: 'Implement biometric login, social OAuth, and secure token management.',
        workStatus: 'pending',
        stories: [
          {
            title: 'Implement biometric authentication',
            description: 'Add fingerprint and Face ID support using react-native-biometrics.',
            priority: 'high',
            workStatus: 'pending',
            tasks: [
              {
                title: 'Set up biometric module',
                description: 'Configure react-native-biometrics with fallback to device passcode.',
                acceptanceCriteria: [
                  'Fingerprint auth works on Android 10+',
                  'Face ID works on iOS 14+',
                  'Graceful fallback when biometrics unavailable',
                ],
                technicalNotes: 'Handle BiometryType.None by prompting device passcode fallback.',
                personaIndex: 1,
                workStatus: 'pending',
              },
              {
                title: 'Implement secure token storage',
                description:
                  'Store JWT tokens in the platform keychain/keystore for secure persistence.',
                acceptanceCriteria: [
                  'Tokens stored in iOS Keychain',
                  'Tokens stored in Android Keystore',
                  'Tokens cleared on logout',
                ],
                technicalNotes: 'Use react-native-keychain for cross-platform secure storage.',
                personaIndex: 1,
                workStatus: 'pending',
              },
              {
                title: 'Write authentication flow tests',
                description:
                  'Create unit and integration tests for the biometric authentication flow.',
                acceptanceCriteria: [
                  'Happy path tested',
                  'Biometric failure handled',
                  'Token refresh tested',
                ],
                technicalNotes: 'Mock biometric module in tests using jest.mock.',
                personaIndex: 2,
                workStatus: 'pending',
              },
            ],
          },
          {
            title: 'Add social login providers',
            description: 'Support Google and Apple sign-in for frictionless onboarding.',
            priority: 'medium',
            workStatus: 'pending',
            tasks: [
              {
                title: 'Integrate Google Sign-In',
                description: 'Configure Google OAuth2 with react-native-google-signin.',
                acceptanceCriteria: [
                  'Sign-in works on both platforms',
                  'User profile data retrieved',
                  'Handles cancelled sign-in gracefully',
                ],
                technicalNotes:
                  'Register both iOS and Android OAuth client IDs in Google Cloud Console.',
                personaIndex: 1,
                workStatus: 'pending',
              },
              {
                title: 'Integrate Apple Sign-In',
                description:
                  'Implement Sign in with Apple using react-native-apple-authentication.',
                acceptanceCriteria: [
                  'Works on iOS 13+',
                  'Handles private email relay',
                  'Meets App Store review guidelines',
                ],
                technicalNotes: 'Apple requires Sign in with Apple if any social login is offered.',
                personaIndex: 1,
                workStatus: 'pending',
              },
            ],
          },
          {
            title: 'Implement session management',
            description: 'Handle token refresh, session expiry, and multi-device session control.',
            priority: 'high',
            workStatus: 'pending',
            tasks: [
              {
                title: 'Build token refresh interceptor',
                description:
                  'Create an Axios interceptor that transparently refreshes expired access tokens.',
                acceptanceCriteria: [
                  'Refreshes before token expiry',
                  'Queues concurrent requests during refresh',
                  'Redirects to login on refresh failure',
                ],
                technicalNotes: 'Use a mutex to prevent concurrent refresh token requests.',
                personaIndex: 0,
                workStatus: 'pending',
              },
              {
                title: 'Add session expiry notification',
                description: 'Show an in-app notification when the session is about to expire.',
                acceptanceCriteria: [
                  'Warning shown 5 minutes before expiry',
                  'User can extend session',
                  'Auto-logout after grace period',
                ],
                technicalNotes: 'Use a background timer that checks token expiry every 60 seconds.',
                personaIndex: 1,
                workStatus: 'pending',
              },
            ],
          },
        ],
      },
      {
        name: 'Product Browsing',
        description: 'Native product listing, detail views, and offline catalog caching.',
        workStatus: 'pending',
        stories: [
          {
            title: 'Build product list screen',
            description: 'Create a performant FlatList-based product listing with infinite scroll.',
            priority: 'medium',
            workStatus: 'pending',
            tasks: [
              {
                title: 'Implement product list with FlatList',
                description:
                  'Build the main product listing screen using FlatList with getItemLayout optimization.',
                acceptanceCriteria: [
                  'Smooth 60fps scrolling',
                  'Pull-to-refresh implemented',
                  'Empty state shown for no results',
                ],
                technicalNotes:
                  'Use getItemLayout for fixed-height items to avoid measurement overhead.',
                personaIndex: 1,
                workStatus: 'pending',
              },
              {
                title: 'Add offline product caching',
                description: 'Cache product data locally using WatermelonDB for offline browsing.',
                acceptanceCriteria: [
                  'Products viewable offline',
                  'Sync on reconnection',
                  'Stale data indicator shown',
                ],
                technicalNotes:
                  'Use WatermelonDB with sync adapter for background synchronization.',
                personaIndex: 1,
                workStatus: 'pending',
              },
            ],
          },
          {
            title: 'Create product detail screen',
            description: 'Build a rich product detail view with image carousel and specifications.',
            priority: 'medium',
            workStatus: 'pending',
            tasks: [
              {
                title: 'Build image carousel component',
                description:
                  'Create a swipeable image carousel with pinch-to-zoom and thumbnail navigation.',
                acceptanceCriteria: [
                  'Smooth gesture handling',
                  'Pinch-to-zoom works',
                  'Thumbnail strip for quick navigation',
                ],
                technicalNotes: 'Use react-native-reanimated for gesture-driven animations.',
                personaIndex: 1,
                workStatus: 'pending',
              },
              {
                title: 'Implement product specifications table',
                description: 'Render product specs as an accessible, expandable key-value table.',
                acceptanceCriteria: [
                  'Handles variable spec count',
                  'Expandable sections for long specs',
                  'Screen reader compatible',
                ],
                technicalNotes: 'Use SectionList for grouped specification categories.',
                personaIndex: 1,
                workStatus: 'pending',
              },
            ],
          },
          {
            title: 'Implement product search with filters',
            description:
              'Add a search bar with category and price range filters to the product browsing experience.',
            priority: 'high',
            workStatus: 'pending',
            tasks: [
              {
                title: 'Build search input with debounce',
                description:
                  'Create a search bar component with debounced text input and clear button.',
                acceptanceCriteria: [
                  'Debounces input by 300ms',
                  'Shows loading indicator during search',
                  'Clear button resets results',
                ],
                technicalNotes: 'Use a custom useDebounce hook to avoid excessive API calls.',
                personaIndex: 1,
                workStatus: 'pending',
              },
              {
                title: 'Implement filter bottom sheet',
                description:
                  'Build a bottom sheet with category checkboxes and price range slider for filtering results.',
                acceptanceCriteria: [
                  'Category multi-select works',
                  'Price range slider updates results',
                  'Active filter count shown on trigger button',
                ],
                technicalNotes: 'Use @gorhom/bottom-sheet for gesture-driven sheet behavior.',
                personaIndex: 1,
                workStatus: 'pending',
              },
            ],
          },
        ],
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Test user
// ---------------------------------------------------------------------------

export const TEST_USER = {
  name: 'Laila Development User',
  email: 'dev@laila.local',
  emailVerified: true,
} as const;
