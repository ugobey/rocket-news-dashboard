const service_name = "Rocket Alert / News Dashboard";
const service_page_name = "main";

const express = require("express");
const router = express.Router();

require("dotenv").config();

const pkg = require("../package.json");
const pikudHaorefCitiesJSON = require("pikud-haoref-api/cities.json");

router.use("/", async function (req, res) {
    try {
        res.render(service_page_name, {
            title: service_name,
            appVersion: pkg.version,
            cities: JSON.stringify(pikudHaorefCitiesJSON),
        });
    } catch (err) {
        console.log(service_name + " ERROR", err);
        res.statusCode = 200;
        res.write("ERROR");
        res.end();
    }
});

module.exports = router;
