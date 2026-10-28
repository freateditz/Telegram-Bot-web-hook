const asyncHandler = require("../utils/asyncHandler");
const userService = require("../services/userService");

const listUsers = asyncHandler(async (req, res) => {
  const items = await userService.listUsers();
  res.json({ ok: true, items });
});

const getUser = asyncHandler(async (req, res) => {
  const item = await userService.getUser(Number(req.params.id));

  if (!item) {
    return res.status(404).json({ ok: false, error: "User not found" });
  }

  res.json({ ok: true, item });
});

const getUserByTelegramId = asyncHandler(async (req, res) => {
  const item = await userService.getUserByTelegramId(req.params.telegramId);

  if (!item) {
    return res.status(404).json({ ok: false, error: "User not found" });
  }

  res.json({ ok: true, item });
});

const createUser = asyncHandler(async (req, res) => {
  const item = await userService.createUser(req.body || {});
  res.status(201).json({ ok: true, item });
});

const updateUser = asyncHandler(async (req, res) => {
  const item = await userService.updateUser(Number(req.params.id), req.body || {});
  res.json({ ok: true, item });
});

const deleteUser = asyncHandler(async (req, res) => {
  await userService.deleteUser(Number(req.params.id));
  res.status(204).send();
});

const setPendingProject = asyncHandler(async (req, res) => {
  await userService.setPendingProject(req.body.telegramId, req.body.projectId);
  res.json({ ok: true });
});

const upsertPendingProject = asyncHandler(async (req, res) => {
  const { telegramId, projectId } = req.body || {};
  if (!telegramId || !projectId) {
    return res.status(400).json({ ok: false, error: "telegramId and projectId are required" });
  }
  const item = await userService.upsertPendingProject(telegramId, projectId);
  res.json({ ok: true, item });
});

const clearPendingProject = asyncHandler(async (req, res) => {
  await userService.clearPendingProject(req.body.telegramId);
  res.json({ ok: true });
});

const upsertPendingResource = asyncHandler(async (req, res) => {
  const { telegramId, slug } = req.body || {};
  if (!telegramId || !slug) {
    return res.status(400).json({ ok: false, error: "telegramId and slug are required" });
  }
  const item = await userService.upsertPendingResource(telegramId, slug);
  res.json({ ok: true, item });
});

const clearPendingResource = asyncHandler(async (req, res) => {
  await userService.clearPendingResource(req.body.telegramId);
  res.json({ ok: true });
});

module.exports = {
  listUsers,
  getUser,
  getUserByTelegramId,
  createUser,
  updateUser,
  deleteUser,
  setPendingProject,
  upsertPendingProject,
  clearPendingProject,
  upsertPendingResource,
  clearPendingResource,
};