const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
    TELEGRAM_BOT_BASE_URL,
    DEFAULT_BOT_USERNAME,
    cleanBotUsername,
    buildResourceDeepLink,
    buildProjectDeepLink,
    isTelegramBotDeepLink,
    migrateBotDeepLinkDomain,
} = require("../shared/deepLink");

describe("Telegram Deep Link Generator & Validation", () => {
    it("should use https://telegram.me as the base URL", () => {
        assert.equal(TELEGRAM_BOT_BASE_URL, "https://telegram.me");
    });

    it("should correctly clean bot usernames", () => {
        assert.equal(cleanBotUsername("FreatEditzResources_Bot"), "FreatEditzResources_Bot");
        assert.equal(cleanBotUsername("@FreatEditzResources_Bot"), "FreatEditzResources_Bot");
        assert.equal(cleanBotUsername("  @MyCustomBot  "), "MyCustomBot");
        assert.equal(cleanBotUsername(null), DEFAULT_BOT_USERNAME);
        assert.equal(cleanBotUsername(""), DEFAULT_BOT_USERNAME);
    });

    describe("Resource deep links", () => {
        it("should generate deep links using https://telegram.me/ and preserve resource slug", () => {
            const url = buildResourceDeepLink("topaz-windows");
            assert.equal(url, "https://telegram.me/FreatEditzResources_Bot?start=resource_topaz-windows");
            assert.match(url, /^https:\/\/telegram\.me\/[A-Za-z0-9_]+\?start=resource_[a-z0-9-]+$/);
        });

        it("should preserve all migrated resource slugs exactly", () => {
            const slugs = [
                "topaz-windows",
                "topaz-mac",
                "after-effects",
                "davinci-resolve",
                "all-plugins",
                "adobe-premiere-pro",
                "topaz-photo-ai",
                "sfx-pack",
                "sfx-pack-mac",
            ];

            for (const slug of slugs) {
                const url = buildResourceDeepLink(slug);
                assert.equal(url, `https://telegram.me/FreatEditzResources_Bot?start=resource_${slug}`);
                assert.ok(url.includes(`resource_${slug}`));
                assert.ok(url.startsWith("https://telegram.me/"));
            }
        });

        it("should support custom bot username without leading @", () => {
            const url = buildResourceDeepLink("topaz-windows", "@TestDownloadBot");
            assert.equal(url, "https://telegram.me/TestDownloadBot?start=resource_topaz-windows");
        });
    });

    describe("Project deep links", () => {
        it("should generate deep links using https://telegram.me/ and preserve project slug", () => {
            const url = buildProjectDeepLink("text-effect-in-60sec");
            assert.equal(url, "https://telegram.me/FreatEditzResources_Bot?start=project_text-effect-in-60sec");
            assert.match(url, /^https:\/\/telegram\.me\/[A-Za-z0-9_]+\?start=project_[a-z0-9-]+$/);
        });

        it("should preserve all migrated project slugs exactly", () => {
            const slugs = [
                "text-effect-in-60sec",
                "one-piece-cc",
                "element-3d",
                "adobe-internet-blocker",
            ];

            for (const slug of slugs) {
                const url = buildProjectDeepLink(slug);
                assert.equal(url, `https://telegram.me/FreatEditzResources_Bot?start=project_${slug}`);
                assert.ok(url.includes(`project_${slug}`));
                assert.ok(url.startsWith("https://telegram.me/"));
            }
        });

        it("should support custom bot username without leading @", () => {
            const url = buildProjectDeepLink("my-project", "@TestProjectBot");
            assert.equal(url, "https://telegram.me/TestProjectBot?start=project_my-project");
        });
    });

    describe("Deep link identification & transformation", () => {
        it("should correctly identify bot deep links", () => {
            assert.equal(isTelegramBotDeepLink("https://t.me/FreatEditzResources_Bot?start=resource_topaz-windows"), true);
            assert.equal(isTelegramBotDeepLink("https://telegram.me/FreatEditzResources_Bot?start=project_text-effect-in-60sec"), true);
            assert.equal(isTelegramBotDeepLink("http://t.me/MyBot?start=resource_item-1"), true);
        });

        it("should NOT identify channel links or external links as bot deep links", () => {
            assert.equal(isTelegramBotDeepLink("https://t.me/freat_editz"), false);
            assert.equal(isTelegramBotDeepLink("https://t.me/+AbCdEfGhIjK"), false);
            assert.equal(isTelegramBotDeepLink("https://t.me/c/1003943904498/7"), false);
            assert.equal(isTelegramBotDeepLink("https://mega.nz/folder/RFNyBBqb#njLs0aEMbASRwcsWka9n7w"), false);
            assert.equal(isTelegramBotDeepLink("https://youtube.com/@freat_editz"), false);
            assert.equal(isTelegramBotDeepLink("https://drive.google.com/file/d/123/view"), false);
            assert.equal(isTelegramBotDeepLink(null), false);
            assert.equal(isTelegramBotDeepLink(""), false);
        });

        it("should migrate legacy t.me bot deep links to telegram.me", () => {
            const legacyRes = "https://t.me/FreatEditzResources_Bot?start=resource_topaz-windows";
            assert.equal(migrateBotDeepLinkDomain(legacyRes), "https://telegram.me/FreatEditzResources_Bot?start=resource_topaz-windows");

            const legacyProj = "https://t.me/FreatEditzResources_Bot?start=project_text-effect-in-60sec";
            assert.equal(migrateBotDeepLinkDomain(legacyProj), "https://telegram.me/FreatEditzResources_Bot?start=project_text-effect-in-60sec");
        });

        it("should leave channel links, download links, and unrelated URLs unchanged", () => {
            const channelLink = "https://t.me/freat_editz";
            assert.equal(migrateBotDeepLinkDomain(channelLink), channelLink);

            const channelMsgLink = "https://t.me/c/1003943904498/7";
            assert.equal(migrateBotDeepLinkDomain(channelMsgLink), channelMsgLink);

            const megaLink = "https://mega.nz/folder/RFNyBBqb#njLs0aEMbASRwcsWka9n7w";
            assert.equal(migrateBotDeepLinkDomain(megaLink), megaLink);

            const ytLink = "https://youtube.com/@freat_editz";
            assert.equal(migrateBotDeepLinkDomain(ytLink), ytLink);
        });
    });
});
