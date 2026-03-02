# Write OpenAPI Spec

## Task Details

- **Title:** Write OpenAPI Spec
- **Status:** Complete
- **Assigned Agent:** api-designer
- **Parent User Story:** [Create OpenAPI Specification](./tasks.md)
- **Parent Epic:** [Shared Packages & API Contracts](../../user-stories.md)
- **Dependencies:** None (within this user story)

## Description

Write the complete OpenAPI 3.1 specification in `packages/api-spec/openapi.yaml` covering all REST endpoints under `/api/v1`. This is the single source of truth for the API contract — all route handlers, client SDK types, and API documentation are derived from this specification.

The spec should define:

- All CRUD endpoints for projects, epics, user stories, tasks, workers, and personas
- Work assignment and completion endpoints for the orchestration protocol
- Authentication schemes (Google OAuth for humans, API key for workers)
- Request/response schemas matching the Zod schemas defined in @laila/shared
- Standard error response formats
- Pagination parameters and response shapes

All endpoints are under the `/api/v1` prefix. Human-facing endpoints use session-based auth (Google OAuth via Better Auth). Worker-facing endpoints use API key authentication via the `X-API-Key` header.

## Acceptance Criteria

- [ ] `packages/api-spec/openapi.yaml` is a valid OpenAPI 3.1 document
- [ ] Info section includes title, version, description, and contact information
- [ ] Server section defines base URL with `/api/v1` prefix
- [ ] **Project endpoints:** `GET /projects`, `POST /projects`, `GET /projects/{projectId}`, `PATCH /projects/{projectId}`, `DELETE /projects/{projectId}`
- [ ] **Epic endpoints:** `GET /projects/{projectId}/epics`, `POST /projects/{projectId}/epics`, `GET /epics/{epicId}`, `PATCH /epics/{epicId}`, `DELETE /epics/{epicId}`
- [ ] **User Story endpoints:** `GET /epics/{epicId}/stories`, `POST /epics/{epicId}/stories`, `GET /stories/{storyId}`, `PATCH /stories/{storyId}`, `DELETE /stories/{storyId}`
- [ ] **Task endpoints:** `GET /stories/{storyId}/tasks`, `POST /stories/{storyId}/tasks`, `GET /tasks/{taskId}`, `PATCH /tasks/{taskId}`, `DELETE /tasks/{taskId}`
- [ ] **Task dependency endpoints:** `POST /tasks/{taskId}/dependencies`, `DELETE /tasks/{taskId}/dependencies/{dependencyTaskId}`
- [ ] **Worker endpoints:** `GET /workers`, `POST /workers`, `GET /workers/{workerId}`, `PATCH /workers/{workerId}`, `DELETE /workers/{workerId}`, `POST /workers/{workerId}/regenerate-key`
- [ ] **Persona endpoints:** `GET /personas`, `POST /personas`, `GET /personas/{personaId}`, `PATCH /personas/{personaId}`, `DELETE /personas/{personaId}`
- [ ] **Work orchestration endpoints:** `POST /work/next` (get next assignment), `POST /work/complete` (submit completion)
- [ ] **Audit endpoints:** `GET /audit/{entityId}` (query audit log for entity)
- [ ] Security schemes defined: `sessionAuth` (cookie-based, Google OAuth), `apiKeyAuth` (X-API-Key header)
- [ ] Each endpoint specifies which security scheme(s) it accepts
- [ ] All request bodies have schema definitions with required/optional fields
- [ ] All responses include success schemas and error response schemas (400, 401, 403, 404, 409, 500)
- [ ] List endpoints include pagination query parameters and paginated response schemas
- [ ] Component schemas are defined in `components/schemas` and referenced via `$ref`
- [ ] The discriminated union for work assignment response is properly represented (using `oneOf` with `discriminator`)

## Technical Notes

- OpenAPI 3.1 uses JSON Schema 2020-12 for schema definitions, which supports `oneOf` with `discriminator` for typed unions
- Use `$ref` extensively to avoid schema duplication — define reusable schemas in `components/schemas`
- Pagination pattern:
  ```yaml
  # Standard pagination query parameters reused across list endpoints
  components:
    parameters:
      PageParam:
        name: page
        in: query
        schema:
          type: integer
          default: 1
          minimum: 1
      LimitParam:
        name: limit
        in: query
        schema:
          type: integer
          default: 20
          minimum: 1
          maximum: 100
  ```
- Error response pattern:
  ```yaml
  # Standard error response reused across all endpoints
  components:
    schemas:
      ErrorResponse:
        type: object
        required: [error]
        properties:
          error:
            type: object
            required: [code, message, requestId]
            properties:
              code:
                type: string
              message:
                type: string
              details:
                type: array
                items:
                  $ref: '#/components/schemas/FieldError'
              requestId:
                type: string
                format: uuid
  ```
- Work assignment discriminated union:
  ```yaml
  WorkAssignmentResponse:
    oneOf:
      - $ref: '#/components/schemas/WorkAssigned'
      - $ref: '#/components/schemas/WorkBlocked'
      - $ref: '#/components/schemas/WorkAllComplete'
    discriminator:
      propertyName: type
      mapping:
        assigned: '#/components/schemas/WorkAssigned'
        blocked: '#/components/schemas/WorkBlocked'
        all_complete: '#/components/schemas/WorkAllComplete'
  ```
- Consider organizing the spec into multiple files using `$ref` to external files if it becomes very large, though a single file is simpler for tooling
- Ensure schema names align with the Zod schema names in @laila/shared for consistency
- The `409 Conflict` response is specifically for optimistic locking failures (version mismatch)

## References

- **Functional Requirements:** Complete REST API surface for orchestration service
- **Design Specification:** OpenAPI 3.1, REST conventions, authentication schemes
- **Project Setup:** @laila/api-spec package

## Estimated Complexity

Large — Comprehensive API specification covering 30+ endpoints with full request/response schemas, authentication, error handling, and pagination. This is a substantial document that defines the entire API contract.
