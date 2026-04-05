const config = require("../config");

const service_name = "Ajax";

const express = require("express");
const router = express.Router();

const fs = require("fs");

const pikudHaoref = require("pikud-haoref-api");

let HttpsProxyAgent;

async function main() {
    try {
        ({ HttpsProxyAgent } = await import("https-proxy-agent"));
    } catch (err) {
        console.error(service_name, "Failed to load https-proxy-agent:", err.message || err);
    }
}

main();

const { parseFeed } = require("@rowanmanning/feed-parser");

const { execFile } = require("node:child_process");

const pkg = require("../package.json");
const serverAppVersion = pkg.version;

const locations = require("../locations_by_zone");

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
        citySelector: () => [randomItem(allCities)],
    });
}

function generateRandomAlertByRegion() {
    return generateAlert({
        typeSelector: () => randomItem(alertTypes),
        citySelector: () => randomItem(regions),
    });
}

let earlyWarningTest = 0;
let earlyWarningRegion;

function generateRandomEarlyWarningAlert() {
    return new Promise((resolve, reject) => {
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
        } else if (earlyWarningTest === 1) {
            earlyWarningTest++;
            type = "missiles";
            instructions = "ירי רקטות וטילים";
        } else if (earlyWarningTest === 2) {
            earlyWarningTest = 0;
            type = "newsFlash";
            instructions = "האירוע הסתיים";
        } else {
            resolve([]);
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

function logError(context, err) {
    console.error(`${service_name} ERROR [${context}]`, {
        message: err?.message,
        stack: err?.stack,
    });
}

function sendJson(res, statusCode, payload) {
    if (res.headersSent) {
        return;
    }

    res.status(statusCode).json(payload);
}

function sendJsonError(res, statusCode, err, context) {
    if (err) {
        logError(context, err);
    }

    const message = err?.message || "Internal Server Error";
    sendJson(res, statusCode, { error: message });
}

function asyncHandler(fn, context) {
    return async function wrappedAsyncHandler(req, res, next) {
        try {
            await fn(req, res, next);
        } catch (err) {
            sendJsonError(res, 500, err, context);
        }
    };
}

router.use(
    "/",
    asyncHandler(async function ajaxRouteHandler(req, res) {
        const getService = req.body.service;
        const testmode = req.body.testmode;

        if (getService === "pikud_haoref") {
            let options = {};

            if (testmode) {
                let alert;

                if (testmode === "alertByCity") {
                    alert = generateRandomAlertByCity();
                } else if (testmode === "alertByRegion") {
                    alert = generateRandomAlertByRegion();
                } else if (testmode === "earlyWarning") {
                    alert = await generateRandomEarlyWarningAlert();
                } else if (testmode === "nonMissileUAV") {
                    alert = generateRandomNonMissileUAVAlert();
                } else {
                    sendJson(res, 400, { error: `Unknown test mode: ${testmode}` });
                    return;
                }

                sendJson(res, 200, alert ?? []);
                return;
            }

            pikudHaoref.getActiveAlerts(function (err, alert) {
                try {
                    if (err) {
                        sendJsonError(res, 500, err, "pikud_haoref.getActiveAlerts");
                        return;
                    }

                    sendJson(res, 200, alert);
                } catch (callbackErr) {
                    sendJsonError(res, 500, callbackErr, "pikud_haoref.getActiveAlerts.callback");
                }
            }, options);

            return;
        } else if (getService === "rss") {
            const rssFeed = req.body.rssfeed;

            if (!rssFeed) {
                sendJson(res, 400, { error: "Missing RSS URL" });
                return;
            }

            let parsedUrl = null;
            try {
                parsedUrl = new URL(rssFeed);
            } catch {
                parsedUrl = null;
            }

            if (!parsedUrl || (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:")) {
                sendJson(res, 400, { error: "Invalid RSS URL" });
                return;
            }

            const rssAbortController = new AbortController();
            const rssTimeoutId = setTimeout(() => rssAbortController.abort(), 10000);

            try {
                const fetchFeed = await fetch(rssFeed, { signal: rssAbortController.signal });

                if (!fetchFeed.ok) {
                    sendJson(res, 502, { error: `RSS fetch failed with status ${fetchFeed.status}` });
                    return;
                }

                const responseText = await fetchFeed.text();

                try {
                    const feed = parseFeed(responseText);
                    sendJson(res, 200, { feed });
                } catch (parseError) {
                    sendJsonError(res, 422, parseError, "rss.parseFeed");
                }
            } catch (fetchError) {
                const msg = fetchError.name === "AbortError" ? "RSS fetch timed out" : fetchError.message || "RSS fetch failed";
                sendJson(res, 502, { error: msg });
            } finally {
                clearTimeout(rssTimeoutId);
            }

            return;
        } else if (getService === "version_check") {
            if (process.platform === "win32") {
                sendJson(res, 501, { error: "Version check is not supported on Windows" });
                return;
            }

            // Use execFile with separate arguments to eliminate any shell injection risk.
            execFile("npm", ["view", config.gitRepo, "version"], (error, stdout, stderr) => {
                if (error) {
                    sendJsonError(res, 500, error, "version_check.execFile");
                    return;
                }

                const latestVersion = stdout.trim();

                if (!latestVersion) {
                    logError("version_check.emptyVersion", new Error("Could not determine latest version"));
                    console.error(service_name, "version_check: empty version returned", { stderr });
                    sendJson(res, 500, { error: "Could not determine latest version" });
                    return;
                }

                sendJson(res, 200, {
                    serverAppVersion,
                    latestVersion,
                });
            });

            return;
        }

        sendJson(res, 400, { error: "No service selected" });
    }, "ajaxRouteHandler"),
);

module.exports = router;
