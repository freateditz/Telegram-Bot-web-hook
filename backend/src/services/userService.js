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

async function markVerifiedByTelegramId(telegramId) {
  const normalized = String(telegramId).trim();

  if (!normalized) {
    throw new HttpError(400, "telegramId is required");
  }

  return prisma.user.upsert({
    where: { telegramId: normalized },
    create: { telegramId: normalized, verified: true },
    update: { verified: true },
  });
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
 * pending project. Used by the bot when a deep link is hit by a user
 * who has never interacted with the bot before — `setPendingProject`
 * would throw Prisma P2025 in that case.
 */
async function upsertPendingProject(telegramId, projectId) {
  const normalized = String(telegramId).trim();
  return prisma.user.upsert({
    where: { telegramId: normalized },
    create: { telegramId: normalized, pendingProjectId: projectId },
    update: { pendingProjectId: projectId },
  });
}

async function clearPendingProject(telegramId) {
  const normalized = String(telegramId).trim();
  // Use updateMany (not update) so this is a no-op for users that don't
  // exist yet — /start fires this on every session, including for
  // brand-new users who have no row in the User table.
  return prisma.user.updateMany({
    where: { telegramId: normalized },
    data: { pendingProjectId: null },
  });
}

async function upsertPendingResource(telegramId, slug) {
  const normalized = String(telegramId).trim();
  return prisma.user.upsert({
    where: { telegramId: normalized },
    create: { telegramId: normalized, pendingResourceSlug: slug },
    update: { pendingResourceSlug: slug },
  });
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
  markVerifiedByTelegramId,
  markUnverifiedByTelegramId,
  setPendingProject,
  upsertPendingProject,
  clearPendingProject,
  upsertPendingResource,
  clearPendingResource,
};