# Backend Test Layers

`*.test.ts` files are unit tests. They exercise a single module and mock dependencies at module boundaries; they do not connect to MongoDB.

`*.integration.test.ts` files run under `jest.integration.config.ts` and must call `setupMemoryMongo()` from `src/testUtils/db`.

- **Route/middleware contract** (`*.integration.test.ts`): Express wiring, route order, RBAC, and validation over real routers. Do not stub controllers with `controllerMarker`.
- **Business-flow integration** (`*.integration.test.ts`): Controller flows against real Mongoose models with `mongodb-memory-server`. These should prove user-visible behavior across authorization, business rules, transactions, and persisted state; avoid standalone tests that only assert a model/index exists.

Never mock modules under `src/models/` in integration tests. Seed with helpers from `src/testUtils/db`, then assert persisted state with Mongoose reads or HTTP plus DB proof.

Run unit tests: `npx yarn@1.22.22 test:unit`. Run integration (routes + MongoDB): `npx yarn@1.22.22 test:integration`. Run both: `npx yarn@1.22.22 test`.
