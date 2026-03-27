const service_name = "Ajax";

const express = require("express");
const router = express.Router();

const fs = require("fs");

const pikudHaoref = require("pikud-haoref-api");

const { parseFeed } = require("@rowanmanning/feed-parser");

const { exec } = require("node:child_process");

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

function generateRandomAlertByCity() {
    // Randomly select an alert type for testing purposes. In a real scenario, the API would provide the actual alert type.
    const alertTypes = ["missiles", "hostileAircraftIntrusion", "newsFlash"];
    // For testing, we can randomly select an alert type. In a real implementation, this would come from the API response.
    const randomType = alertTypes[Math.floor(Math.random() * alertTypes.length)];

    // Combine all cities into one array for random selection
    const allCities = [...arava, ...beitSheanValley, ...beitShemesh, ...bikaa, ...centerNegev, ...confrontationLine, ...dan, ...deadSea, ...dromHashfela, ...eilat, ...gazaEnvelope, ...golan, ...haifa, ...haShfela, ...hefer, ...hofHaCarmel, ...jerusalem, ...katzrin, ...krayot, ...lachish, ...lowerGalilee, ...menashe, ...sharon, ...shomron, ...southNegev, ...tavor, ...upperGalilee, ...wadiAra, ...westLachish, ...westNegev, ...yarkon, ...yearotHaCarmel, ...yehuda];

    // For testing purposes, we can randomly select a few cities from the list to simulate an alert affecting multiple locations. In a real scenario, the API would provide the actual affected cities.
    const randomCities = allCities.sort(() => 0.5 - Math.random()).slice(0, Math.floor(Math.random() * 10) + 1);

    // For news flash alerts, we can randomly select an instruction from a predefined list. In a real scenario, the API would provide the actual instructions.
    const randomNewsFlashTypes = ["האירוע הסתיים", "ירי רקטות וטילים"];

    // For testing, we can randomly select an instruction for news flash alerts. In a real implementation, this would come from the API response.
    const instructions = randomType === "newsFlash" ? randomNewsFlashTypes[Math.floor(Math.random() * randomNewsFlashTypes.length)] : null;

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

function generateRandomAlertByRegion() {
    // Randomly select an alert type for testing purposes. In a real scenario, the API would provide the actual alert type.
    const alertTypes = ["missiles", "hostileAircraftIntrusion", "newsFlash"];
    // For testing, we can randomly select an alert type. In a real implementation, this would come from the API response.
    const randomType = alertTypes[Math.floor(Math.random() * alertTypes.length)];

    // Select a random region (zone) and randomize its cities
    const regions = [arava, beitSheanValley, beitShemesh, bikaa, centerNegev, confrontationLine, dan, deadSea, dromHashfela, eilat, gazaEnvelope, golan, haifa, haShfela, hefer, hofHaCarmel, jerusalem, katzrin, krayot, lachish, lowerGalilee, menashe, sharon, shomron, southNegev, tavor, upperGalilee, wadiAra, westLachish, westNegev, yarkon, yearotHaCarmel, yehuda];
    const randomRegion = regions[Math.floor(Math.random() * regions.length)];

    // For news flash alerts, we can randomly select an instruction from a predefined list. In a real scenario, the API would provide the actual instructions.
    const randomNewsFlashTypes = ["האירוע הסתיים", "ירי רקטות וטילים"];

    // For testing, we can randomly select an instruction for news flash alerts. In a real implementation, this would come from the API response.
    const instructions = randomType === "newsFlash" ? randomNewsFlashTypes[Math.floor(Math.random() * randomNewsFlashTypes.length)] : null;

    // Return a simulated alert object with the randomly selected type, cities, and instructions. In a real implementation, this would be the actual response from the API.
    return [
        {
            type: randomType,
            cities: randomRegion,
            instructions: instructions,
            id: Date.now().toString(),
        },
    ];
}

router.use("/", async function (req, res) {
    try {
        const getService = req.body.service;
        const testmode = req.body.testmode;

        if (getService === "pikud_haoref") {
            const options = {};

            pikudHaoref.getActiveAlerts(function (err, alert) {
                if (err) {
                    console.log(service_name, err);
                    fs.appendFileSync("./logs/pikudHaoref_errors.txt", err + "\n\n");

                    res.statusCode = 200;
                    res.write(JSON.stringify({ error: err.toString() }));
                    res.end();
                    return;
                }

                if (testmode === "true") {
                    alert = generateRandomAlertByRegion();
                }

                res.statusCode = 200;
                res.write(JSON.stringify(alert));
                res.end();
            }, options);
        } else if (getService === "rss") {
            const rssFeed = req.body.rssfeed;

            let response = {};

            if (rssFeed) {
                const fetchFeed = await fetch(rssFeed);
                const responseText = await fetchFeed.text();

                try {
                    const feed = parseFeed(responseText);

                    response = { feed: feed };
                } catch (error) {
                    response = { error: "INVALID_FEED" };
                }
            } else {
                response = { error: "Missing RSS URL" };
            }

            res.statusCode = 200;
            res.write(JSON.stringify(response));
            res.end();
        } else if (getService === "version_check") {
            exec("npm view git@github.com:ugobey/rocket-news-dashboard.git version", (error, stdout, stderr) => {
                if (error) {
                    res.statusCode = 500;
                    res.write(JSON.stringify({ error: error.toString() }));
                    res.end();
                    return;
                }

                const latestVersion = stdout.trim();

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
        console.log(service_name + " ERROR", err);
        res.statusCode = 500;
        res.write(JSON.stringify({ error: err.toString() }));
        res.end();
    }
});

module.exports = router;
