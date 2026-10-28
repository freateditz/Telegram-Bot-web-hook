const { PrismaClient } = require("@prisma/client");

let activeClient = globalThis.__prismaClient || null;

/**
 * Initialize or get a Prisma Client instance.
 *
 * If a Cloudflare D1 database binding is provided, uses `@prisma/adapter-d1`.
 * Otherwise, falls back to the default PrismaClient (for local development,
 * testing, and Node.js environments).
 *
 * @param {object} [d1Database] - Cloudflare D1 database binding (env.DB)
 * @returns {PrismaClient}
 */
function createPrismaClient(d1Database) {
  if (d1Database) {
    const { PrismaD1 } = require("@prisma/adapter-d1");
    const adapter = new PrismaD1(d1Database);
    return new PrismaClient({ adapter });
  }

  return new PrismaClient();
}

function setPrismaClient(client) {
  activeClient = client;
  if (process.env.NODE_ENV !== "production") {
    globalThis.__prismaClient = client;
  }
}

function getPrismaClient(d1Database) {
  if (d1Database) {
    return createPrismaClient(d1Database);
  }

  if (!activeClient) {
    activeClient = createPrismaClient();
    if (process.env.NODE_ENV !== "production") {
      globalThis.__prismaClient = activeClient;
    }
  }

  return activeClient;
}

const target = {
  createPrismaClient,
  setPrismaClient,
  getPrismaClient,
};

/**
 * Proxy wrapper so any module doing `const prisma = require('./prisma')`
 * can call `prisma.platform.findMany()` etc. directly without knowing
 * whether it's running in Cloudflare Workers with D1 or in Node.js.
 */
const prisma = new Proxy(target, {
  get(tgt, prop) {
    if (prop in tgt) {
      return tgt[prop];
    }
    const client = activeClient || getPrismaClient();
    const val = client[prop];
    return typeof val === "function" ? val.bind(client) : val;
  },
  set(tgt, prop, value) {
    tgt[prop] = value;
    return true;
  },
});

module.exports = prisma;
