const prisma = require("../database/prisma");
const HttpError = require("../utils/httpError");
const { toSlug } = require("../utils/slug");

/**
 * Project CRUD.
 *
 * Two delivery models are supported and resolved at READ time:
 *
 *   1. New (channel-based): `channelId` + `messageId` set → the bot
 *      calls `copyMessage(userChatId, channel.channelId, messageId)`.
 *   2. Legacy (file-id):     `telegramFileId` set → the bot calls
 *      `sendDocument(userChatId, telegramFileId)`. Preserved for
 *      projects created before the Channel model existed.
 *
 * At LEAST one delivery model must be set. The service refuses to
 * save a project with no delivery surface.
 */

function normalizeProjectPayload(payload) {
  const title = String(payload.title || "").trim();
  const slug = String(payload.slug || toSlug(title)).trim();
  const description = payload.description ? String(payload.description).trim() : null;
  const thumbnail = payload.thumbnail ? String(payload.thumbnail).trim() : null;
  const isActive = payload.isActive !== undefined ? Boolean(payload.isActive) : true;
  const telegramFileId = payload.telegramFileId ? String(payload.telegramFileId).trim() : null;
  const telegramMessageLink = payload.telegramMessageLink
    ? String(payload.telegramMessageLink).trim()
    : null;

  let channelId = null;
  if (payload.channelId !== undefined && payload.channelId !== null && payload.channelId !== "") {
    const parsed = Number(payload.channelId);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new HttpError(400, "channelId must be a positive integer");
    }
    channelId = parsed;
  }

  let messageId = null;
  if (payload.messageId !== undefined && payload.messageId !== null && payload.messageId !== "") {
    const parsed = Number(payload.messageId);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new HttpError(400, "messageId must be a positive integer");
    }
    messageId = parsed;
  }

  return {
    title,
    slug,
    description,
    thumbnail,
    isActive,
    telegramFileId,
    telegramMessageLink,
    channelId,
    messageId,
  };
}

function hasNewDelivery(data) {
  return Boolean(data.channelId && data.messageId);
}

function hasLegacyDelivery(data) {
  return Boolean(data.telegramFileId || data.telegramMessageLink);
}

async function assertChannelIsUsable(channelId, { mustBeActive = true } = {}) {
  if (!channelId) {
    throw new HttpError(400, "Channel is required");
  }
  const channel = await prisma.channel.findUnique({ where: { id: channelId } });
  if (!channel) {
    throw new HttpError(400, "Selected channel does not exist");
  }
  if (mustBeActive && !channel.isActive) {
    throw new HttpError(400, "Selected channel is inactive");
  }
  return channel;
}

async function assertNoDuplicateMessageInChannel({ channelId, messageId, projectId }) {
  if (!channelId || !messageId) return;
  const existing = await prisma.project.findFirst({
    where: { channelId, messageId, NOT: projectId ? { id: projectId } : undefined },
  });
  if (existing) {
    throw new HttpError(
      409,
      `Message ${messageId} is already used by project "${existing.title}" in this channel`
    );
  }
}

async function assertSlugIsAvailable(slug, projectId) {
  const existing = await prisma.project.findFirst({
    where: { slug, NOT: projectId ? { id: projectId } : undefined },
  });
  if (existing) {
    throw new HttpError(409, `Slug "${slug}" is already in use`);
  }
}

function assertAtLeastOneDelivery(data) {
  if (hasNewDelivery(data) || hasLegacyDelivery(data)) {
    return;
  }
  throw new HttpError(
    400,
    "A delivery source is required: either channel + messageId, or a legacy telegramFileId / telegramMessageLink"
  );
}

const PROJECT_INCLUDE = {
  channel: {
    select: { id: true, name: true, channelId: true, username: true, isActive: true },
  },
};

async function listProjects() {
  return prisma.project.findMany({
    orderBy: [{ createdAt: "desc" }],
    include: PROJECT_INCLUDE,
  });
}

async function getProject(id) {
  return prisma.project.findUnique({
    where: { id },
    include: PROJECT_INCLUDE,
  });
}

async function getProjectBySlug(slug) {
  return prisma.project.findUnique({
    where: { slug },
    include: PROJECT_INCLUDE,
  });
}

async function getProjectForDelivery(slug) {
  // Used by the bot — same as getProjectBySlug but the project MUST be
  // active and (if channel-based) the channel MUST be active too.
  const project = await getProjectBySlug(slug);
  if (!project) return null;
  if (!project.isActive) return { project, blocked: "project_inactive" };
  if (project.channelId && (!project.channel || !project.channel.isActive)) {
    return { project, blocked: "channel_inactive" };
  }
  if (!hasNewDelivery(project) && !hasLegacyDelivery(project)) {
    return { project, blocked: "no_delivery" };
  }
  return { project };
}

async function createProject(payload) {
  const data = normalizeProjectPayload(payload);
  if (!data.title) throw new HttpError(400, "title is required");
  if (!data.slug) throw new HttpError(400, "slug is required");
  if (!/^[a-z0-9-]+$/.test(data.slug)) {
    throw new HttpError(400, "slug must be lowercase letters, numbers, and dashes");
  }
  assertAtLeastOneDelivery(data);
  await assertSlugIsAvailable(data.slug);
  if (data.channelId) {
    await assertChannelIsUsable(data.channelId);
  }
  if (data.channelId && !data.messageId) {
    throw new HttpError(400, "messageId is required when a channel is selected");
  }
  if (!data.channelId && data.messageId) {
    throw new HttpError(400, "channelId is required when messageId is set");
  }
  await assertNoDuplicateMessageInChannel({
    channelId: data.channelId,
    messageId: data.messageId,
  });

  return prisma.project.create({ data, include: PROJECT_INCLUDE });
}

async function updateProject(id, payload) {
  const existing = await prisma.project.findUnique({ where: { id } });
  if (!existing) {
    throw new HttpError(404, "Project not found");
  }

  const data = normalizeProjectPayload(payload);

  // Re-validate the merged state so partial updates don't strand a
  // project without any delivery source.
  const merged = {
    channelId: data.channelId !== null ? data.channelId : existing.channelId,
    messageId: data.messageId !== null ? data.messageId : existing.messageId,
    telegramFileId: data.telegramFileId !== null ? data.telegramFileId : existing.telegramFileId,
    telegramMessageLink:
      data.telegramMessageLink !== null ? data.telegramMessageLink : existing.telegramMessageLink,
  };
  if (!hasNewDelivery(merged) && !hasLegacyDelivery(merged)) {
    throw new HttpError(
      400,
      "A delivery source is required: either channel + messageId, or a legacy telegramFileId / telegramMessageLink"
    );
  }
  if (merged.channelId && !merged.messageId) {
    throw new HttpError(400, "messageId is required when a channel is selected");
  }
  if (merged.channelId) {
    await assertChannelIsUsable(merged.channelId);
  }
  await assertNoDuplicateMessageInChannel({
    channelId: merged.channelId,
    messageId: merged.messageId,
    projectId: id,
  });

  // Slug uniqueness on update.
  if (data.slug && data.slug !== existing.slug) {
    if (!/^[a-z0-9-]+$/.test(data.slug)) {
      throw new HttpError(400, "slug must be lowercase letters, numbers, and dashes");
    }
    await assertSlugIsAvailable(data.slug, id);
  }

  // Whitelist fields actually being changed so the partial update is
  // intentional. `null` explicitly clears a column.
  const patch = {};
  if (data.title) patch.title = data.title;
  if (data.slug) patch.slug = data.slug;
  if (data.description !== null) patch.description = data.description;
  if (data.thumbnail !== null) patch.thumbnail = data.thumbnail;
  if (payload.isActive !== undefined) patch.isActive = data.isActive;
  if (data.telegramFileId !== null) patch.telegramFileId = data.telegramFileId;
  if (data.telegramMessageLink !== null) patch.telegramMessageLink = data.telegramMessageLink;
  if (payload.channelId !== undefined) patch.channelId = data.channelId;
  if (payload.messageId !== undefined) patch.messageId = data.messageId;

  if (Object.keys(patch).length === 0) {
    throw new HttpError(400, "At least one field is required");
  }

  return prisma.project.update({
    where: { id },
    data: patch,
    include: PROJECT_INCLUDE,
  });
}

async function deleteProject(id) {
  const existing = await prisma.project.findUnique({ where: { id } });
  if (!existing) {
    throw new HttpError(404, "Project not found");
  }
  // Clear any pending project pointers that reference this id so users
  // don't get stuck on a "verify to download X" prompt for a deleted X.
  await prisma.user.updateMany({
    where: { pendingProjectId: id },
    data: { pendingProjectId: null },
  });
  return prisma.project.delete({ where: { id } });
}

async function incrementViewCount(id) {
  return prisma.project.update({
    where: { id },
    data: { viewCount: { increment: 1 }, lastViewedAt: new Date() },
  });
}

async function incrementFailedVerificationCount(id) {
  return prisma.project.update({
    where: { id },
    data: { failedVerificationCount: { increment: 1 } },
  });
}

async function incrementDownloadCount(id) {
  return prisma.project.update({
    where: { id },
    data: { downloadCount: { increment: 1 }, lastDownloadedAt: new Date() },
  });
}

module.exports = {
  listProjects,
  getProject,
  getProjectBySlug,
  getProjectForDelivery,
  createProject,
  updateProject,
  deleteProject,
  incrementViewCount,
  incrementFailedVerificationCount,
  incrementDownloadCount,
  // Exposed for unit tests / external validation only.
  _internal: { normalizeProjectPayload, hasNewDelivery, hasLegacyDelivery },
};
