const { WebSocketServer, WebSocket } = require("ws");
const config = require("./config");
const pikudHaoref = require("pikud-haoref-api");
const { parseFeed } = require("@rowanmanning/feed-parser");
const { execFile } = require("node:child_process");
const pkg = require("./package.json");
const serverAppVersion = pkg.version;

const locations = require("./locations_by_zone");

// ── DATA ─────────────────────────────────────────────────────────────────────

const arava = locations.arava;
const beitSheanValley = locations.beitSheanValley;
const beitShemesh = locations.beitShemesh;
const bikaa = locations.bikaa;
const centerNegev = locations.centerNegev;
const confrontationLine = locations.confrontationLine;
const dan = locations.dan;
const deadSea = locations.deadSea;
const dromHashfela = locations.dromHashfela;
const eilat = locations.eilat;
const gazaEnvelope = locations.gazaEnvelope;
const golan = locations.golan;
const haifa = locations.haifa;
const haShfela = locations.haShfela;
const hefer = locations.hefer;
const hofHaCarmel = locations.hofHaCarmel;
const jerusalem = locations.jerusalem;
const katzrin = locations.katzrin;
const krayot = locations.krayot;
const lachish = locations.lachish;
const lowerGalilee = locations.lowerGalilee;
const menashe = locations.menashe;
const sharon = locations.sharon;
const shomron = locations.shomron;
const southNegev = locations.southNegev;
const tavor = locations.tavor;
const upperGalilee = locations.upperGalilee;
const wadiAra = locations.wadiAra;
const westLachish = locations.westLachish;
const westNegev = locations.westNegev;
const yarkon = locations.yarkon;
const yearotHaCarmel = locations.yearotHaCarmel;
const yehuda = locations.yehuda;

const allCities = [...arava, ...beitSheanValley, ...beitShemesh, ...bikaa, ...centerNegev, ...confrontationLine, ...dan, ...deadSea, ...dromHashfela, ...eilat, ...gazaEnvelope, ...golan, ...haifa, ...haShfela, ...hefer, ...hofHaCarmel, ...jerusalem, ...katzrin, ...krayot, ...lachish, ...lowerGalilee, ...menashe, ...sharon, ...shomron, ...southNegev, ...tavor, ...upperGalilee, ...wadiAra, ...westLachish, ...westNegev, ...yarkon, ...yearotHaCarmel, ...yehuda];
const regions = [arava, beitSheanValley, beitShemesh, bikaa, centerNegev, confrontationLine, dan, deadSea, dromHashfela, eilat, gazaEnvelope, golan, haifa, haShfela, hefer, hofHaCarmel, jerusalem, katzrin, krayot, lachish, lowerGalilee, menashe, sharon, shomron, southNegev, tavor, upperGalilee, wadiAra, westLachish, westNegev, yarkon, yearotHaCarmel, yehuda];
const alertTypes = ["missiles", "hostileAircraftIntrusion", "newsFlash"];

let earlyWarningTest = 0;
let earlyWarningRegion;

// ── HELPERS ──────────────────────────────────────────────────────────────────

function parseFeedItemDate(value) {
    if (!value) {
        return null;
    }

    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value;
    }

    const parsedDate = new Date(value);
    return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
}

function isSameLocalDay(dateA, dateB) {
    return dateA.getFullYear() === dateB.getFullYear()
        && dateA.getMonth() === dateB.getMonth()
        && dateA.getDate() === dateB.getDate();
}

function filterFeedItemsToToday(feed) {
    if (!feed || !Array.isArray(feed.items)) {
        return feed;
    }

    const today = new Date();

    return {
        ...feed,
        items: feed.items.filter((item) => {
            const itemDate = parseFeedItemDate(
                item?.published
                || item?.updated
                || item?.pubDate
                || item?.isoDate
                || item?.date,
            );

            return itemDate ? isSameLocalDay(itemDate, today) : false;
        }),
    };
}

function randomItem(items) {
    return items[Math.floor(Math.random() * items.length)];
}

function generateAlert({ typeSelector, citySelector, instructionsSelector = () => "ירי רקטות וטילים", shouldSkip = (type) => type === "newsFlash" }) {
    const type = typeSelector();

    if (shouldSkip(type)) {
        return [];
    }

    return [
        {
            type,
            cities: citySelector(type),
            instructions: instructionsSelector(type),
            id: Date.now().toString(),
        },
    ];
}

function generateRandomAlertByCity() {
    return generateAlert({
        typeSelector: () => randomItem(alertTypes),
        citySelector: () => {
            if (Math.random() < 0.2) {
                const numCities = Math.floor(Math.random() * 4) + 2;
                const cities = [];
                for (let i = 0; i < numCities; i++) {
                    cities.push(randomItem(allCities));
                }
                return cities;
            }

            return [randomItem(allCities)];
        },
    });
}

function generateRandomAlertByRegion() {
    return generateAlert({
        typeSelector: () => randomItem(alertTypes),
        citySelector: () => randomItem(regions),
    });
}

function generateRandomEarlyWarningAlert() {
    return new Promise((resolve) => {
        let type;
        let instructions;

        if (earlyWarningTest === 0) {
            earlyWarningRegion = randomItem(regions);
            earlyWarningTest++;
            type = "newsFlash";
            instructions = "ירי רקטות וטילים";

            resolve(
                generateAlert({
                    typeSelector: () => type,
                    citySelector: () => earlyWarningRegion,
                    instructionsSelector: () => instructions,
                    shouldSkip: () => false,
                }),
            );
            return;
        }

        if (earlyWarningTest === 1) {
            earlyWarningTest++;
            type = "missiles";
            instructions = "ירי רקטות וטילים";
        } else if (earlyWarningTest === 2) {
            earlyWarningTest = 0;
            type = "newsFlash";
            instructions = "האירוע הסתיים";
        } else {
            resolve([]);
            return;
        }

        setTimeout(() => {
            resolve(
                generateAlert({
                    typeSelector: () => type,
                    citySelector: () => earlyWarningRegion,
                    instructionsSelector: () => instructions,
                    shouldSkip: () => false,
                }),
            );
        }, 5000);
    });
}

function generateRandomNonMissileUAVAlert() {
    const nonMissileUavAlertTypes = ["general", "earthQuake", "radiologicalEvent", "tsunami", "hazardousMaterials", "terroristInfiltration"];

    return generateAlert({
        typeSelector: () => randomItem(nonMissileUavAlertTypes),
        citySelector: () => [randomItem(allCities)],
        instructionsSelector: () => null,
        shouldSkip: () => false,
    });
}

// ── SERVICES ─────────────────────────────────────────────────────────────────

async function getPikudHaorefAlerts(testmode) {
    // In test mode, bypass external API calls and return deterministic mock payloads.
    if (testmode) {
        if (testmode === "alertByCity") {
            return generateRandomAlertByCity() ?? [];
        }

        if (testmode === "alertByRegion") {
            return generateRandomAlertByRegion() ?? [];
        }

        if (testmode === "earlyWarning") {
            return (await generateRandomEarlyWarningAlert()) ?? [];
        }

        if (testmode === "nonMissileUAV") {
            return generateRandomNonMissileUAVAlert() ?? [];
        }

        throw new Error(`Unknown test mode: ${testmode}`);
    }

    return await new Promise((resolve, reject) => {
        pikudHaoref.getActiveAlerts(function (err, alert) {
            if (err) {
                reject(err);
                return;
            }

            resolve(alert);
        }, {});
    });
}

async function getRssFeedData(rssFeed) {
    if (!rssFeed) {
        throw new Error("Missing RSS URL");
    }

    let parsedUrl = null;
    try {
        parsedUrl = new URL(rssFeed);
    } catch {
        parsedUrl = null;
    }

    if (!parsedUrl || (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:")) {
        throw new Error("Invalid RSS URL");
    }

    // Guard feed fetches with a timeout so one slow source does not block the loop.
    const rssAbortController = new AbortController();
    const rssTimeoutId = setTimeout(() => rssAbortController.abort(), 10000);

    try {
        const fetchFeed = await fetch(rssFeed, { signal: rssAbortController.signal });

        if (!fetchFeed.ok) {
            throw new Error(`RSS fetch failed with status ${fetchFeed.status}`);
        }

        const responseText = await fetchFeed.text();

        try {
            const feed = parseFeed(responseText);
            return { feed: filterFeedItemsToToday(feed) };
        } catch (parseError) {
            parseError.code = "RSS_PARSE_ERROR";
            throw parseError;
        }
    } catch (fetchError) {
        if (fetchError?.name === "AbortError") {
            throw new Error("RSS fetch timed out");
        }

        throw fetchError;
    } finally {
        clearTimeout(rssTimeoutId);
    }
}

async function getVersionCheck() {
    if (process.platform === "win32") {
        const err = new Error("Version check is not supported on Windows");
        err.code = "WIN32_UNSUPPORTED";
        throw err;
    }

    return await new Promise((resolve, reject) => {
        execFile("npm", ["view", config.gitRepo, "version"], (error, stdout, stderr) => {
            if (error) {
                reject(error);
                return;
            }

            const latestVersion = stdout.trim();

            if (!latestVersion) {
                console.error("Ajax", "version_check: empty version returned", { stderr });
                reject(new Error("Could not determine latest version"));
                return;
            }

            resolve({ serverAppVersion, latestVersion });
        });
    });
}

// ── SOCKET RUNTIME ────────────────────────────────────────────────────────────

function setupWebsocketServer({ server }) {
    const websocketServer = new WebSocketServer({
        server,
        path: "/ws",
    });

    function sendWebsocketMessage(socket, payload) {
        if (!socket || socket.readyState !== WebSocket.OPEN) {
            return;
        }

        socket.send(JSON.stringify(payload));
    }

    websocketServer.on("connection", (socket) => {
        // Client-scoped settings; each dashboard tab has its own independent runtime state.
        const clientState = {
            testmode: null,
            rssFeeds: [],
            rssIndex: 0,
        };

        let pikudTimeoutHandle = null;
        let rssTimeoutHandle = null;
        let versionCheckTimeoutHandle = null;

        const schedulePikudPush = async function () {
            try {
                const payload = await getPikudHaorefAlerts(clientState.testmode);
                sendWebsocketMessage(socket, {
                    type: "pikud_alert",
                    payload,
                });
            } catch (err) {
                sendWebsocketMessage(socket, {
                    type: "pikud_alert",
                    payload: {
                        error: err?.message || "Pikud push failed",
                    },
                });
            } finally {
                // Keep polling while the websocket remains open.
                if (socket.readyState === WebSocket.OPEN) {
                    pikudTimeoutHandle = setTimeout(schedulePikudPush, 1000);
                }
            }
        };

        const scheduleRssPush = async function () {
            try {
                if (clientState.rssFeeds.length > 0) {
                    // Round-robin across configured feeds to spread network load.
                    const feed = clientState.rssFeeds[clientState.rssIndex];

                    clientState.rssIndex++;
                    if (clientState.rssIndex >= clientState.rssFeeds.length) {
                        clientState.rssIndex = 0;
                    }

                    if (feed?.url) {
                        const payload = await getRssFeedData(feed.url);
                        sendWebsocketMessage(socket, {
                            type: "rss_feed",
                            feedUrl: feed.url,
                            payload,
                        });
                    }
                }
            } catch (err) {
                sendWebsocketMessage(socket, {
                    type: "rss_feed",
                    payload: {
                        error: err?.message || "RSS push failed",
                    },
                });
            } finally {
                if (socket.readyState === WebSocket.OPEN) {
                    rssTimeoutHandle = setTimeout(scheduleRssPush, 10000);
                }
            }
        };

        socket.on("message", (rawMessage) => {
            try {
                const message = JSON.parse(String(rawMessage || "{}"));

                if (message?.type === "config") {
                    // Accept only non-empty URLs and reset rotation whenever config changes.
                    const incomingFeeds = Array.isArray(message?.rssFeeds) ? message.rssFeeds : [];
                    clientState.rssFeeds = incomingFeeds.filter((feed) => typeof feed?.url === "string" && feed.url.trim() !== "");
                    clientState.rssIndex = 0;

                    // Immediately push all feeds in parallel so the table fills on page load.
                    if (clientState.rssFeeds.length > 0) {
                        for (const feed of clientState.rssFeeds) {
                            getRssFeedData(feed.url).then((payload) => {
                                sendWebsocketMessage(socket, {
                                    type: "rss_feed",
                                    feedUrl: feed.url,
                                    payload,
                                });
                            }).catch((err) => {
                                sendWebsocketMessage(socket, {
                                    type: "rss_feed",
                                    feedUrl: feed.url,
                                    payload: { error: err?.message || "RSS initial fetch failed" },
                                });
                            });
                        }
                    }

                    return;
                }

                if (message?.type === "set_test_mode") {
                    // Empty values disable test mode and restore live data.
                    clientState.testmode = typeof message?.testmode === "string" && message.testmode.trim() !== ""
                        ? message.testmode.trim()
                        : null;
                }
            } catch (parseError) {
                sendWebsocketMessage(socket, {
                    type: "system_error",
                    payload: {
                        error: parseError?.message || "Invalid websocket message",
                    },
                });
            }
        });

        socket.on("close", () => {
            // Prevent orphaned timers after client disconnect.
            if (pikudTimeoutHandle !== null) {
                clearTimeout(pikudTimeoutHandle);
            }

            if (rssTimeoutHandle !== null) {
                clearTimeout(rssTimeoutHandle);
            }

            if (versionCheckTimeoutHandle !== null) {
                clearTimeout(versionCheckTimeoutHandle);
            }
        });

        const scheduleVersionCheckPush = async function () {
            try {
                const payload = await getVersionCheck();
                sendWebsocketMessage(socket, {
                    type: "version_check",
                    payload,
                });
            } catch (err) {
                sendWebsocketMessage(socket, {
                    type: "version_check",
                    payload: {
                        error: err?.message || "Version check failed",
                    },
                });
            } finally {
                // Re-check periodically so clients can surface newly published releases.
                if (socket.readyState === WebSocket.OPEN) {
                    versionCheckTimeoutHandle = setTimeout(scheduleVersionCheckPush, 120000);
                }
            }
        };

        schedulePikudPush();
        scheduleRssPush();
        scheduleVersionCheckPush();
    });

    return websocketServer;
}

// ── EXPORTS ──────────────────────────────────────────────────────────────────

module.exports = {
    setupWebsocketServer,
};
