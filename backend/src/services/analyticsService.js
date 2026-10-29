const prisma = require('../database/prisma');
const userService = require('./userService');

const trackEvent = async ({ userId, projectId, resourceId, eventType, metadata }) => {
  try {
    if (!userId || !eventType) {
      throw new Error('userId and eventType are required');
    }

    // Resolve or upsert User record so AnalyticsEvent.userId stores internal User.id
    const user = await userService.upsertUser(userId);

    const serializedMetadata = typeof metadata === 'object' && metadata !== null
      ? JSON.stringify(metadata)
      : (metadata || null);

    await prisma.analyticsEvent.create({
      data: {
        userId: user.id,
        projectId: projectId ? Number(projectId) : null,
        resourceId: resourceId ? Number(resourceId) : null,
        eventType,
        metadata: serializedMetadata,
      },
    });
    return { success: true };
  } catch (error) {
    console.error('Failed to track analytics event:', error.message || error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  trackEvent,
};
