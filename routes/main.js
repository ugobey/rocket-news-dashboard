const service_name = "Rocket Alert / News Dashboard";
const service_page_name = "main";

const express = require("express");
const router = express.Router();

require("dotenv").config();

const sharedFunction = require("../shared/functions.js");
const errorHandler = sharedFunction.errorHandler;

router.use("/", function (req, res) {
    try {
        (async () => {
            res.render(service_page_name, {
                title: service_name,
            });
        })().catch((err) =>
            setImmediate(() => {
                errorHandler(service_name, "Error : " + err);
            })
        );
    } catch (err) {
        errorHandler(service_name, "Error : " + err);
        res.statusCode = 200;
        res.write("ERROR");
        res.end();
    }
});

module.exports = router;
