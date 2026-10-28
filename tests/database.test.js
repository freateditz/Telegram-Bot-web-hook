const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { setupTestDatabase, cleanupTestDatabase } = require("./setup");

describe("Database & Prisma Operations", () => {
    let prisma;

    before(() => {
        prisma = setupTestDatabase();
    });

    after(async () => {
        if (prisma) await prisma.$disconnect();
        cleanupTestDatabase();
    });

    it("should read seeded platforms and categories", async () => {
        const platforms = await prisma.platform.findMany();
        assert.ok(platforms.length >= 2, "Expected at least 2 platforms");
        assert.ok(platforms.some(p => p.slug === "windows"));
        assert.ok(platforms.some(p => p.slug === "mac"));

        const categories = await prisma.category.findMany();
        assert.ok(categories.length >= 5, "Expected at least 5 categories");
        assert.ok(categories.some(c => c.slug === "software"));
    });

    it("should create and query channels and projects with relations", async () => {
        const channel = await prisma.channel.create({
            data: {
                name: "Test VIP Channel",
                channelId: "-100987654321",
                username: "@vip_channel",
                isActive: true,
            },
        });
        assert.ok(channel.id);
        assert.equal(channel.name, "Test VIP Channel");

        const project = await prisma.project.create({
            data: {
                title: "After Effects Pack",
                slug: "ae-pack-2026",
                description: "VFX pack for editors",
                channelId: channel.id,
                messageId: 42,
                isActive: true,
            },
        });
        assert.ok(project.id);
        assert.equal(project.slug, "ae-pack-2026");

        // Verify relationship loading
        const loadedProject = await prisma.project.findUnique({
            where: { id: project.id },
            include: { channel: true },
        });
        assert.ok(loadedProject.channel);
        assert.equal(loadedProject.channel.channelId, "-100987654321");
    });

    it("should create and query resources with platform and category relations", async () => {
        const platform = await prisma.platform.findUnique({ where: { slug: "windows" } });
        const category = await prisma.category.findUnique({ where: { slug: "software" } });

        const resource = await prisma.resource.create({
            data: {
                name: "Blender 3D",
                slug: "blender-windows",
                platformId: platform.id,
                categoryId: category.id,
                downloadLink: "https://example.com/blender.zip",
                fixLink: "https://example.com/fix.zip",
                tutorialChannelId: "-100123456789",
                tutorialMessageId: 10,
            },
        });

        assert.ok(resource.id);
        assert.equal(resource.slug, "blender-windows");

        const loadedResource = await prisma.resource.findUnique({
            where: { slug: "blender-windows" },
            include: { platform: true, category: true },
        });

        assert.equal(loadedResource.platform.slug, "windows");
        assert.equal(loadedResource.category.slug, "software");
    });

    it("should enforce unique constraint on resource slug", async () => {
        const platform = await prisma.platform.findFirst();
        const category = await prisma.category.findFirst();

        await assert.rejects(async () => {
            await prisma.resource.create({
                data: {
                    name: "Duplicate Blender",
                    slug: "blender-windows", // duplicate slug
                    platformId: platform.id,
                    categoryId: category.id,
                },
            });
        }, /Unique constraint/);
    });

    it("should handle User with pendingProjectId and pendingResourceSlug", async () => {
        const user = await prisma.user.create({
            data: {
                telegramId: "123456789",
                verified: false,
                pendingResourceSlug: "blender-windows",
            },
        });

        assert.ok(user.id);
        assert.equal(user.pendingResourceSlug, "blender-windows");
        assert.equal(user.verified, false);

        // Update verification
        const verified = await prisma.user.update({
            where: { telegramId: "123456789" },
            data: { verified: true },
        });
        assert.equal(verified.verified, true);
    });

    it("should track TelegramUpdate for deduplication", async () => {
        const update = await prisma.telegramUpdate.create({
            data: { updateId: "9988776655" },
        });
        assert.equal(update.updateId, "9988776655");

        // Duplicate insert should throw unique constraint error
        await assert.rejects(async () => {
            await prisma.telegramUpdate.create({
                data: { updateId: "9988776655" },
            });
        }, /Unique constraint/);
    });

    it("should record and query analytics events", async () => {
        const user = await prisma.user.findFirst();
        const event = await prisma.analyticsEvent.create({
            data: {
                userId: user.id,
                eventType: "BOT_START",
                metadata: JSON.stringify({ referrer: "test" }),
            },
        });

        assert.ok(event.id);
        assert.equal(event.eventType, "BOT_START");

        const count = await prisma.analyticsEvent.count({
            where: { eventType: "BOT_START" },
        });
        assert.ok(count >= 1);
    });
});
