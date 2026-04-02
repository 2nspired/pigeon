# Project Tracker

Local-first kanban board with MCP integration for AI-assisted development.

## Tech Stack

- Next.js 16 (App Router, Turbopack) + React 19
- Prisma 7 + SQLite (file:./data/tracker.db)
- tRPC v11 + React Query v5 (3s polling)
- shadcn/ui (new-york) + Tailwind CSS 4
- @dnd-kit for drag-and-drop
- MCP server (stdio) at src/mcp/server.ts

## Commands

- `npm run dev` — start dev server
- `npm run mcp:dev` — run MCP server standalone (for testing)
- `npm run db:push` — push schema changes to SQLite
- `npm run db:studio` — open Prisma Studio

## Project Structure

- `src/server/services/` — business logic (ServiceResult pattern)
- `src/server/api/routers/` — tRPC routers (all publicProcedure, no auth)
- `src/mcp/` — MCP server (separate process, own db.ts)
- `src/components/board/` — board UI components
- `prisma/schema.prisma` — data model

## Agent Guidelines

See [AGENTS.md](AGENTS.md) for board usage guidelines, column definitions, workflow conventions, and connection instructions. Those guidelines apply to all agents (Claude, Codex, etc.).
