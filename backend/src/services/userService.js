const prisma = require("../database/prisma");
const HttpError = require("../utils/httpError");

async function listUsers() {
  return prisma.user.findMany({ orderBy: [{ createdAt: "desc" }] });
}

async function getUser(id) {
  return prisma.user.findUnique({ where: { id } });
}

async function getUserByTelegramId(telegramId) {
  return prisma.user.findUnique({ where: { telegramId: String(telegramId) } });
}

async function createUser(payload) {
  const telegramId = String(payload.telegramId || "").trim();
  const verified = payload.verified === undefined ? false : Boolean(payload.verified);

  if (!telegramId) {
    throw new HttpError(400, "telegramId is required");
  }

  return prisma.user.create({ data: { telegramId, verified } });
}

async function updateUser(id, payload) {
  const data = {};

  if (payload.telegramId !== undefined) {
    data.telegramId = String(payload.telegramId).trim();
  }

  if (payload.verified !== undefined) {
    data.verified = Boolean(payload.verified);
  }

  if (Object.keys(data).length === 0) {
    throw new HttpError(400, "At least one field is required");
  }

  return prisma.user.update({ where: { id }, data });
}

async function deleteUser(id) {
  return prisma.user.delete({ where: { id } });
}

/**
 * Transaction-free safe upsert for Cloudflare D1.
 * D1 does not support interactive transactions; Prisma's built-in upsert
 * uses an implicit transaction which generates repeated warnings and can break
 * under D1's execution model.
 */
async function upsertUser(telegramId, dataToSet = {}) {
  const normalized = String(telegramId).trim();
  if (!normalized) {
    throw new HttpError(400, "telegramId is required");
  }

  const existing = await prisma.user.findUnique({
    where: { telegramId: normalized },
  });

  if (existing) {
    if (Object.keys(dataToSet).length > 0) {
      return prisma.user.update({
        where: { telegramId: normalized },
        data: dataToSet,
      });
    }
    return existing;
  }

  try {
    return await prisma.user.create({
      data: {
        telegramId: normalized,
        ...dataToSet,
      },
    });
  } catch (err) {
    // If concurrently created by a racing request, update the existing row
    if (err.code === "P2002") {
      if (Object.keys(dataToSet).length > 0) {
        return prisma.user.update({
          where: { telegramId: normalized },
          data: dataToSet,
        });
      }
      return prisma.user.findUnique({ where: { telegramId: normalized } });
    }
    throw err;
  }
}

async function markVerifiedByTelegramId(telegramId) {
  return upsertUser(telegramId, { verified: true });
}

async function markUnverifiedByTelegramId(telegramId) {
  const normalized = String(telegramId).trim();

  if (!normalized) {
    throw new HttpError(400, "telegramId is required");
  }

  return prisma.user.updateMany({
    where: { telegramId: normalized },
    data: { verified: false },
  });
}

async function setPendingProject(telegramId, projectId) {
  const normalized = String(telegramId).trim();
  return prisma.user.update({
    where: { telegramId: normalized },
    data: { pendingProjectId: projectId },
  });
}

/**
 * Idempotent: creates the user row if it doesn't exist, then sets the
 * pending project.
 */
async function upsertPendingProject(telegramId, projectId) {
  return upsertUser(telegramId, { pendingProjectId: projectId });
}

async function clearPendingProject(telegramId) {
  const normalized = String(telegramId).trim();
  return prisma.user.updateMany({
    where: { telegramId: normalized },
    data: { pendingProjectId: null },
  });
}

async function upsertPendingResource(telegramId, slug) {
  return upsertUser(telegramId, { pendingResourceSlug: slug });
}

async function clearPendingResource(telegramId) {
  const normalized = String(telegramId).trim();
  return prisma.user.updateMany({
    where: { telegramId: normalized },
    data: { pendingResourceSlug: null },
  });
}

module.exports = {
  listUsers,
  getUser,
  getUserByTelegramId,
  createUser,
  updateUser,
  deleteUser,
  upsertUser,
  markVerifiedByTelegramId,
  markUnverifiedByTelegramId,
  setPendingProject,
  upsertPendingProject,
  clearPendingProject,
  upsertPendingResource,
  clearPendingResource,
};
