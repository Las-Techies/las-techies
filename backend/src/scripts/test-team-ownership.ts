/**
 * Standalone security-boundary test for the team switcher — run with:
 *   npx tsx src/scripts/test-team-ownership.ts
 *
 * The repo has no test runner wired up, so this is a self-contained script (no
 * database, no vitest/jest). It stubs the model + Supabase layers via the
 * require cache, then drives activateTeamHandler with fake req/res objects to
 * assert the one thing that must never regress: a manager cannot activate a
 * team they don't own. It also checks the happy path so we know the stub wiring
 * is actually exercising the handler.
 */

/* eslint-disable @typescript-eslint/no-var-requires */

// --- Stub the model layer BEFORE the controller requires it. --------------
// The controller does `import { findTeamByIdForManager } from "../models/team.model"`,
// which compiles to a namespace require — so mutating the cached module's
// exports here is what the handler will actually call.
const teamModelPath = require.resolve("../models/team.model");
const userModelPath = require.resolve("../models/user.model");
const supabaseAdminPath = require.resolve("../db/supabaseAdmin");

// Ownership map: only manager 7 owns team 42. Anyone asking for a team not in
// their own set gets `null`, exactly like the real findFirst(where id+managerId).
const OWNERSHIP: Record<number, number> = { 42: 7 };

let assignCalls: Array<{ supabaseUserId: string; teamId: number; role: string }> = [];

require.cache[teamModelPath] = {
  id: teamModelPath,
  filename: teamModelPath,
  loaded: true,
  exports: {
    findTeamByIdForManager: async (id: number, managerId: number) => {
      return OWNERSHIP[id] === managerId ? { id, name: `Team ${id}` } : null;
    },
    // Unused by activateTeamHandler but referenced by the module's imports.
    createTeam: async () => ({ id: 0, name: "" }),
    findTeamById: async () => null,
    findTeamsByManager: async () => [],
    claimTeamIfUnowned: async () => ({ count: 0 }),
  },
} as any;

require.cache[userModelPath] = {
  id: userModelPath,
  filename: userModelPath,
  loaded: true,
  exports: {
    assignUserTeamAndRole: async (input: {
      supabaseUserId: string;
      teamId: number;
      role: string;
    }) => {
      assignCalls.push(input);
      return { id: 1, ...input };
    },
  },
} as any;

require.cache[supabaseAdminPath] = {
  id: supabaseAdminPath,
  filename: supabaseAdminPath,
  loaded: true,
  exports: {
    supabaseAdmin: {
      auth: { admin: { updateUserById: async () => ({ error: null }) } },
    },
  },
} as any;

// Now require the controller — it binds to the stubbed modules above.
const { activateTeamHandler } = require("../controllers/teams.controller");

// --- Minimal Express req/res doubles. -------------------------------------
function makeRes() {
  const res: any = { statusCode: 200, body: undefined };
  res.status = (code: number) => {
    res.statusCode = code;
    return res;
  };
  res.json = (payload: any) => {
    res.body = payload;
    return res;
  };
  return res;
}

let failures = 0;
function check(name: string, cond: boolean) {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.error(`  ✗ ${name}`);
  }
}

async function run() {
  // Case 1: manager 7 activates team 42 (owned) → 200, DB write happens.
  {
    assignCalls = [];
    const req: any = { params: { teamId: "42" }, user: { id: 7, supabaseUserId: "sb-7" } };
    const res = makeRes();
    let nextErr: unknown = null;
    await activateTeamHandler(req, res, (e: unknown) => (nextErr = e));
    console.log("Case 1 — owner activates own team:");
    check("no error passed to next()", nextErr === null);
    check("responds 200", res.statusCode === 200);
    check("returns the team", res.body?.data?.id === 42);
    check("writes active team to DB once", assignCalls.length === 1);
    check("DB write targets the requested team", assignCalls[0]?.teamId === 42);
  }

  // Case 2: manager 7 activates team 99 (NOT owned) → 404, NO DB write.
  {
    assignCalls = [];
    const req: any = { params: { teamId: "99" }, user: { id: 7, supabaseUserId: "sb-7" } };
    const res = makeRes();
    let nextErr: unknown = null;
    await activateTeamHandler(req, res, (e: unknown) => (nextErr = e));
    console.log("Case 2 — manager activates a team they don't own:");
    check("no error passed to next()", nextErr === null);
    check("responds 404", res.statusCode === 404);
    check("does NOT write to DB", assignCalls.length === 0);
    check("does not leak team existence in message", /not found or not yours/i.test(res.body?.error?.message ?? ""));
  }

  // Case 3: a team owned by a DIFFERENT manager (42 belongs to 7) requested by
  // manager 8 → 404, NO DB write. Guards against cross-manager takeover.
  {
    assignCalls = [];
    const req: any = { params: { teamId: "42" }, user: { id: 8, supabaseUserId: "sb-8" } };
    const res = makeRes();
    let nextErr: unknown = null;
    await activateTeamHandler(req, res, (e: unknown) => (nextErr = e));
    console.log("Case 3 — manager activates another manager's team:");
    check("responds 404", res.statusCode === 404);
    check("does NOT write to DB", assignCalls.length === 0);
  }

  console.log("");
  if (failures > 0) {
    console.error(`FAILED: ${failures} assertion(s) failed.`);
    process.exit(1);
  }
  console.log("All team-ownership assertions passed.");
}

run().catch((err) => {
  console.error("Test crashed:", err);
  process.exit(1);
});
