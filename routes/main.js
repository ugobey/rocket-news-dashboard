const config = require("../config");

const service_name = "Rocket Alert / News Dashboard";
const service_page_name = "main";

const express = require("express");
const router = express.Router();

require("dotenv").config();

const pkg = require("../package.json");
const pikudHaorefCitiesJSON = require("pikud-haoref-api/cities.json");

function logError(context, err) {
    console.error(`${service_name} ERROR [${context}]`, {
        message: err?.message,
        stack: err?.stack,
    });
}

function sendInternalError(res, err, context) {
    logError(context, err);

    if (res.headersSent) {
        return;
    }

    res.status(500).send("Internal Server Error");
}

function asyncHandler(fn, context) {
    return async function wrappedAsyncHandler(req, res, next) {
        try {
            await fn(req, res, next);
        } catch (err) {
            sendInternalError(res, err, context);
        }
    };
}

function buildMainViewModel() {
    try {
        return {
            title: service_name,
            appVersion: pkg.version,
            cities: JSON.stringify(pikudHaorefCitiesJSON),
            rssFeeds: JSON.stringify(Array.isArray(config.rssFeeds) ? config.rssFeeds : []),
            googleMapsApiKey: config.googleMapsApiKey,
        };
    } catch (err) {
        logError("buildMainViewModel", err);
        throw err;
    }
}

router.use(
    "/",
    asyncHandler(async function mainRouteHandler(req, res) {
        const viewModel = buildMainViewModel();
        res.render(service_page_name, viewModel);
    }, "mainRouteHandler"),
);

module.exports = router;
