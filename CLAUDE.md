# Bun + Elysia Project Guidelines

## Stack

- **Runtime**: Bun
- **Framework**: Elysia
- **Language**: TypeScript (strict mode)

## Code Style

### Functions

- Use arrow functions exclusively

```ts
// Good
const getUser = (id: string) => {
  /* ... */
};
const handler = async () => {
  /* ... */
};

// Avoid
function getUser(id: string) {
  /* ... */
}
```

### File Naming

- **kebab-case** for all files and directories
- **Type suffix** to indicate file purpose:
  - `guest.types.ts` - type definitions
  - `guest.service.ts` - business logic
  - `guest.handler.ts` - route handlers
  - `guest.schema.ts` - validation schemas
  - `guest.utils.ts` - utility functions
  - `guest.test.ts` - tests

### Directory Structure

```
src/
  config/           # app configuration (imports from Bun.env)
  types/            # shared type definitions
    zenoti/         # zenoti-specific types (webhook, guest, payment, etc.)
  utils/            # utility functions
  lib/              # third-party integrations & internal libraries
    middleware/     # reusable Elysia middleware
    db/             # database utilities (1 folder per table)
    transformers/   # pure data transformation functions
      zenoti/       # zenoti API → internal format mappers
  services/         # business logic & external integrations
  handlers/         # route handlers
  routes/           # route definitions
    crm/
    health/
    webstore/
    zenoti/
index.ts            # app entry point
```

### Path Aliases

Use `@/` imports for cleaner code:

```ts
import config from '@/config';
import { logger } from '@/utils';
import type { GuestData } from '@/types';
```

## DRY Principles

- Extract reusable logic into utils
- Create shared types in `src/types/`
- Use barrel exports (`index.ts`) for clean imports
- Config lives in one place (`src/config/`)
- Use `isDev` from config, not inline checks
- **1 function per file** in `lib/db/` folders
- **Pure transformers** go in `lib/transformers/`
- **External integrations** go in `services/`

## Performance: Parallel Operations

Use `Promise.allSettled()` for independent operations that can run concurrently:

```ts
// Good: Parallel searches
const searchPromises = [
  db.query.guests
    .findFirst({ where: eq(guests.email, email) })
    .then((g) => ({ type: 'email', guest: g })),
  db.query.guests
    .findFirst({ where: eq(guests.phone, phone) })
    .then((g) => ({ type: 'phone', guest: g })),
];
const results = await Promise.allSettled(searchPromises);

// Good: Parallel independent operations
const [existingLead, guestResolution] = await Promise.all([
  findExistingLead(payload, correlationId),
  resolveGuestId(payload, correlationId),
]);

// Bad: Sequential when parallel is possible
const emailGuest = await findByEmail(email);
const phoneGuest = await findByPhone(phone); // Could run in parallel!
```

When to use parallel:

- Multiple independent DB queries (search by email AND phone)
- Multiple independent API calls (Zenoti search by email AND phone)
- Operations that don't depend on each other's results

When to keep sequential:

- Operations that depend on previous results
- When you need early return on first success (use `Promise.race()` or loop through settled results)

## Database (lib/db)

Each table has its own folder with individual function files:

```
lib/db/
  centers/
    index.ts          # barrel export
    get-by-id.ts      # single function
    get-all.ts
  guests/
    index.ts
    create.ts
    get-by-id.ts
    find-or-create.ts
  events/
    index.ts
    create.ts         # generic event creation
```

All db functions return `DbResult<T>`:

```ts
type DbResult<T = void> =
  | { success: true; data?: T; message: string }
  | { success: false; message: string };
```

## Transformers (lib/transformers)

Pure functions that map external API data to internal formats:

```ts
import { normalizeInvoiceGuestData, transformInvoiceItem } from '@/lib/transformers';

// Zenoti API → NormalizedZenotiGuestData
const guest = normalizeInvoiceGuestData(payload);

// ZenotiInvoiceItem → DB format
const dbItem = transformInvoiceItem(item, invoiceId);
```

## Services

Business logic and external integrations with config checks:

```ts
import { handleCrmForward, handleOfflineConversions } from '@/services';

// Returns null on success/skip, error on failure
const crmError = await handleCrmForward(webhookUrl, guestData, correlationId);
if (crmError) return crmError;

// Fire and forget - handles config check internally
await handleOfflineConversions(guestId, normalizedGuest, correlationId);
```

## Logging

All logs are persisted to the `logs` table for debugging and monitoring. Use `logger.withContext()` for comprehensive logging.

### Core Principle: Always Include correlationId

The `correlationId` is the key to tracing a request's journey through the system. Generate it at the entry point (handler/route) and pass it through every function call.

```ts
import { logger } from '@/utils';
import { generateCorrelationId } from '@/utils';

// Generate at entry point
const correlationId = generateCorrelationId();
```

### Logger Methods

| Method                 | Use Case                         | Persisted |
| ---------------------- | -------------------------------- | --------- |
| `logger.info()`        | General flow tracking            | Yes       |
| `logger.warn()`        | Non-critical issues              | Yes       |
| `logger.success()`     | Successful operations            | Yes       |
| `logger.debug()`       | Development debugging            | Dev only  |
| `logger.error()`       | Error with basic context         | Yes       |
| `logger.withContext()` | Full context logging (preferred) | Yes       |

### Preferred Pattern: logger.withContext()

Use `logger.withContext()` for all logging with full traceability:

```ts
// Create a reusable log context helper
const createLogContext = (
  correlationId: string,
  metadata?: Record<string, unknown>,
): LogOptions => ({
  service: 'zenoti-webhook',
  functionName: 'handleGuestCreated',
  file: 'src/handlers/zenoti/guest-created.handler.ts',
  correlationId,
  metadata,
});

// Use throughout the function
const logContext = createLogContext(correlationId, { centerId, guestId });

await logger.withContext('info', 'Processing webhook', logContext);
await logger.withContext('success', 'Webhook processed', logContext);
```

### Error Logging

**Always use `logger.withContext()` for errors - include the stack trace:**

```ts
try {
  await processGuest(guestData);
} catch (error) {
  await logger.withContext('error', `Failed to process guest: ${(error as Error).message}`, {
    ...logContext,
    stack: (error as Error).stack,
  });
  throw error;
}
```

### Handler Pattern (Entry Point)

```ts
const createLogContext = (
  correlationId: string,
  metadata?: Record<string, unknown>,
): LogOptions => ({
  service: 'zenoti-webhook',
  functionName: 'handleGuestCreated',
  file: 'src/handlers/zenoti/guest-created.handler.ts',
  correlationId,
  metadata,
});

export const handleGuestCreated = async (payload: ZenotiWebhookPayload) => {
  const correlationId = generateCorrelationId();
  const logContext = createLogContext(correlationId, {
    eventType: payload.event,
    centerId: payload.center_id,
  });

  await logger.withContext('info', 'Webhook received', logContext);

  try {
    const result = await processWebhook(payload, correlationId);

    await logger.withContext('success', 'Webhook processed', {
      ...logContext,
      metadata: { ...logContext.metadata, guestId: result.guestId },
    });

    return { status: 'success' };
  } catch (error) {
    await logger.withContext('error', `Handler error: ${(error as Error).message}`, {
      ...logContext,
      stack: (error as Error).stack,
    });

    return { status: 'error', message: (error as Error).message };
  }
};
```

### LogOptions Reference

```ts
type LogOptions = {
  correlationId?: string; // Request trace ID (ALWAYS include)
  service?: string; // e.g., 'zenoti-webhook', 'crm-forward'
  functionName?: string; // e.g., 'handleGuestCreated'
  file?: string; // e.g., 'src/handlers/zenoti/guest-created.handler.ts'
  metadata?: Record<string, unknown>; // Additional context
  stack?: string; // Error stack trace (include for errors)
};
```

### Database Table

All logs go to the `logs` table with these key columns:

- `level` - info, warn, success, error, debug
- `message` - Log message
- `correlation_id` - Request trace ID
- `service` - Service name
- `function_name` - Function name
- `file` - Source file path
- `metadata` - JSON context data
- `stack` - Error stack trace
- `resolved` - For error tracking (boolean)

## Validation

Return result objects instead of throwing:

```ts
type ValidationResult = { valid: true; data: T } | { valid: false; error: string };

const result = validatePayload(data);
if (!result.valid) {
  return { status: 'error', message: result.error };
}
```

## Elysia Patterns

### Route Groups

```ts
export const userRoutes = new Elysia({ prefix: '/users' })
  .get('/', getAllUsers)
  .post('/', createUser);
```

### Auth Middleware

Use reusable middleware from `@/lib/middleware`:

```ts
import { withApiKey } from '@/lib/middleware';

export const routes = new Elysia().post('/api/endpoint', handler, { beforeHandle: withApiKey });
```

Available middleware:

- `withApiKey` - Validates API key (skips in dev mode)
- `withApiKeyRequired` - Always requires valid API key

## Commands

```bash
bun dev          # development server (watch mode)
bun start        # production server
bun test         # run tests
bun run format   # format with prettier
```

## Environment

- Store in `.env` (never commit)
- Use `.env.example` as template
- Access via `Bun.env.VARIABLE_NAME`
- Use `isDev` from config for environment checks
