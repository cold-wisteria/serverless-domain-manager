"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const chalk = require("chalk");
class Globals {
    static cliLog(prefix, message) {
        Globals.serverless.cli.log(`${prefix} ${message}`, Globals.pluginName);
    }
    /**
     * Logs error message
     * @param message: message to be printed
     * @param debug: if true then show log only if SLS_DEBUG enabled on else anytime.
     * By default debug mode on and a message will be printed for SLS_DEBUG enabled.
     * @param domain: domain name
     */
    static logError(message, domain, debug) {
        if (debug === undefined) {
            debug = true;
        }
        const canLog = debug && process.env.SLS_DEBUG || !debug;
        if (canLog) {
            const error = chalk.bold.red;
            Globals.cliLog(error("Error:"), `${domain ? domain + ": " : ""} ${message}`);
        }
    }
    /**
     * Logs info message
     * @param message: message to be printed
     * @param debug: if true then show log only if SLS_DEBUG enabled on else anytime.
     * By default debug mode off and a message printed for each call.
     */
    static logInfo(message, debug = false) {
        const canLog = debug && process.env.SLS_DEBUG || !debug;
        if (canLog) {
            Globals.cliLog(chalk.blue("Info:"), message);
        }
    }
    /**
     * Logs warning message
     * @param message: message to be printed
     * @param debug: if true then show log only if SLS_DEBUG enabled on else anytime.
     * By default debug mode off and a message printed for each call.
     */
    static logWarning(message, debug = false) {
        const canLog = debug && process.env.SLS_DEBUG || !debug;
        if (canLog) {
            const warning = chalk.keyword("orange");
            Globals.cliLog(warning("WARNING:"), message);
        }
    }
    /**
     * Prints out a summary of all domain manager related info
     */
    static printDomainSummary(domain) {
        Globals.cliLog(chalk.yellow.underline("Summary:"), chalk.yellow("Distribution Domain Name"));
        Globals.cliLog("", `  Domain Name: ${domain.givenDomainName}`);
        Globals.cliLog("", `  Target Domain: ${domain.domainInfo.domainName}`);
        Globals.cliLog("", `  Hosted Zone Id: ${domain.domainInfo.hostedZoneId}`);
    }
}
exports.default = Globals;
Globals.pluginName = "Serverless Domain Manager";
Globals.defaultRegion = "us-east-1";
Globals.endpointTypes = {
    edge: "EDGE",
    regional: "REGIONAL",
};
Globals.apiTypes = {
    http: "HTTP",
    rest: "REST",
    websocket: "WEBSOCKET",
};
Globals.gatewayAPIIdKeys = {
    [Globals.apiTypes.rest]: "restApiId",
    [Globals.apiTypes.websocket]: "websocketApiId",
};
Globals.tlsVersions = {
    tls_1_0: "TLS_1_0",
    tls_1_2: "TLS_1_2",
};
