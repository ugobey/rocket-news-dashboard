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
const localAppVersion = pkg.version;

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

function generateRandomAlertByCity() {
    // Randomly select an alert type for testing purposes. In a real scenario, the API would provide the actual alert type.

    // For testing, we can randomly select an alert type. In a real implementation, this would come from the API response.
    const randomType = alertTypes[Math.floor(Math.random() * alertTypes.length)];

    // For testing purposes, randomly select a single city from all available cities. In a real scenario, the API would provide the actual affected cities.
    const randomCities = [allCities[Math.floor(Math.random() * allCities.length)]];

    if (randomType === "newsFlash") {
        return [];
    }

    // Return a simulated alert object with the randomly selected type, cities, and instructions. In a real implementation, this would be the actual response from the API.
    return [
        {
            type: randomType,
            cities: randomCities,
            instructions: "ירי רקטות וטילים",
            id: Date.now().toString(),
        },
    ];
}

function generateRandomAlertByRegion() {
    // Randomly select an alert type for testing purposes. In a real scenario, the API would provide the actual alert type.
    const randomType = alertTypes[Math.floor(Math.random() * alertTypes.length)];

    // Select a random region (zone) and randomize its cities
    const randomRegion = regions[Math.floor(Math.random() * regions.length)];

    if (randomType === "newsFlash") {
        return [];
    }

    // Return a simulated alert object with the randomly selected type, cities, and instructions. In a real implementation, this would be the actual response from the API.
    return [
        {
            type: randomType,
            cities: randomRegion,
            instructions: "ירי רקטות וטילים",
            id: Date.now().toString(),
        },
    ];
}

let earlyWarningTest = 0;
let earlyWarningRegion;

function generateRandomEarlyWarningAlert() {
    if (earlyWarningTest === 0) {
        earlyWarningRegion = regions[Math.floor(Math.random() * regions.length)];

        earlyWarningTest++;

        return [
            {
                type: "newsFlash",
                cities: earlyWarningRegion,
                instructions: "ירי רקטות וטילים",
                id: Date.now().toString(),
            },
        ];
    } else if (earlyWarningTest === 1) {
        earlyWarningTest = 0;

        return [
            {
                type: "missiles",
                cities: earlyWarningRegion,
                instructions: "ירי רקטות וטילים",
                id: Date.now().toString(),
            },
        ];
    } else if (earlyWarningTest === 2) {
        earlyWarningTest = 0;

        return [
            {
                type: "newsFlash",
                cities: earlyWarningRegion,
                instructions: "האירוע הסתיים",
                id: Date.now().toString(),
            },
        ];
    }

    return [];
}

function generateRandomNonMissileUAVAlert() {
    // Randomly select an alert type for testing purposes. In a real scenario, the API would provide the actual alert type.
    const alertTypes = ["general", "earthQuake", "radiologicalEvent", "tsunami", "hazardousMaterials", "terroristInfiltration"];
    // For testing, we can randomly select an alert type. In a real implementation, this would come from the API response.
    const randomType = alertTypes[Math.floor(Math.random() * alertTypes.length)];

    // For testing purposes, randomly select a single city from all available cities. In a real scenario, the API would provide the actual affected cities.
    const randomCities = [allCities[Math.floor(Math.random() * allCities.length)]];

    // For news flash alerts, we can randomly select an instruction from a predefined list. In a real scenario, the API would provide the actual instructions.
    // "ירי רקטות וטילים" has a 10% chance, "האירוע הסתיים" has a 90% chance.
    let instructions = null;

    // Return a simulated alert object with the randomly selected type, cities, and instructions. In a real implementation, this would be the actual response from the API.
    return [
        {
            type: randomType,
            cities: randomCities,
            instructions: instructions,
            id: Date.now().toString(),
        },
    ];
}

router.use("/", async function (req, res) {
    try {
        const forwardedPortHeader = req.headers["x-forwarded-port"];
        const forwardedPort = Array.isArray(forwardedPortHeader) ? forwardedPortHeader[0] : forwardedPortHeader;
        const requestPort = Number.parseInt((forwardedPort || "").toString().split(",")[0], 10) || req.socket.localPort;

        const getService = req.body.service;
        const testmode = req.body.testmode;

        if (getService === "pikud_haoref") {
            let options = {};

            /*
            if (requestPort != 8080) {
                options = {
                    httpsAgent: new HttpsProxyAgent(config.proxyUrl),
                    rejectUnauthorized: false,
                };
            }
            */

            if (testmode) {
                let alert;

                if (testmode === "alertByCity") {
                    alert = generateRandomAlertByCity();
                } else if (testmode === "alertByRegion") {
                    alert = generateRandomAlertByRegion();
                } else if (testmode === "earlyWarning") {
                    alert = generateRandomEarlyWarningAlert();
                } else if (testmode === "nonMissileUAV") {
                    alert = generateRandomNonMissileUAVAlert();
                } else {
                    res.statusCode = 400;
                    res.write(JSON.stringify({ error: `Unknown test mode: ${testmode}` }));
                    res.end();
                    return;
                }

                res.statusCode = 200;
                res.write(JSON.stringify(alert ?? []));
                res.end();
            } else {
                pikudHaoref.getActiveAlerts(function (err, alert) {
                    if (err) {
                        console.error(service_name, "pikud_haoref error:", err);

                        res.statusCode = 200;
                        res.write(JSON.stringify({ error: err.message || err.toString() }));
                        res.end();
                        return;
                    }

                    res.statusCode = 200;
                    res.write(JSON.stringify(alert));
                    res.end();
                }, options);
            }
        } else if (getService === "rss") {
            const rssFeed = req.body.rssfeed;

            let response = {};

            if (!rssFeed) {
                response = { error: "Missing RSS URL" };
            } else {
                let parsedUrl = null;
                try {
                    parsedUrl = new URL(rssFeed);
                } catch {
                    parsedUrl = null;
                }

                if (!parsedUrl || (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:")) {
                    response = { error: "Invalid RSS URL" };
                } else {
                    const rssAbortController = new AbortController();
                    const rssTimeoutId = setTimeout(() => rssAbortController.abort(), 10000);

                    try {
                        const fetchFeed = await fetch(rssFeed, { signal: rssAbortController.signal });

                        if (!fetchFeed.ok) {
                            response = { error: `RSS fetch failed with status ${fetchFeed.status}` };
                        } else {
                            const responseText = await fetchFeed.text();

                            try {
                                const feed = parseFeed(responseText);
                                response = { feed: feed };
                            } catch (parseError) {
                                response = { error: "INVALID_FEED" };
                            }
                        }
                    } catch (fetchError) {
                        const msg = fetchError.name === "AbortError" ? "RSS fetch timed out" : (fetchError.message || "RSS fetch failed");
                        response = { error: msg };
                    } finally {
                        clearTimeout(rssTimeoutId);
                    }
                }
            }

            res.statusCode = 200;
            res.write(JSON.stringify(response));
            res.end();
        } else if (getService === "version_check") {
            // Use execFile with separate arguments to eliminate any shell injection risk.
            execFile("npm", ["view", config.gitRepo, "version"], (error, stdout, stderr) => {
                if (error) {
                    console.error(service_name, "version_check exec error:", error.message || error);
                    res.statusCode = 500;
                    res.write(JSON.stringify({ error: error.message || error.toString() }));
                    res.end();
                    return;
                }

                const latestVersion = stdout.trim();

                if (!latestVersion) {
                    console.error(service_name, "version_check: empty version returned", { stderr });
                    res.statusCode = 500;
                    res.write(JSON.stringify({ error: "Could not determine latest version" }));
                    res.end();
                    return;
                }

                if (localAppVersion !== latestVersion) {
                    res.statusCode = 200;
                    res.write(JSON.stringify({ updateAvailable: true, latestVersion: latestVersion }));
                    res.end();
                } else {
                    res.statusCode = 200;
                    res.write(JSON.stringify({ updateAvailable: false, latestVersion: latestVersion }));
                    res.end();
                }
            });
        } else {
            res.statusCode = 200;
            res.write(JSON.stringify({ error: "No RSS Service Selected" }));
            res.end();
        }
    } catch (err) {
        console.error(service_name + " ERROR:", err);

        if (!res.headersSent) {
            res.statusCode = 500;
            res.write(JSON.stringify({ error: err.message || err.toString() }));
            res.end();
        }
    }
});

module.exports = router;
