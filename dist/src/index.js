"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
const APIGatewayWrapper = require("./aws/api-gateway-wrapper");
const CloudFormationWrapper = require("./aws/cloud-formation-wrapper");
const DomainConfig = require("./domain-config");
const globals_1 = require("./globals");
const utils_1 = require("./utils");
const certStatuses = ["PENDING_VALIDATION", "ISSUED", "INACTIVE"];
class ServerlessCustomDomain {
    constructor(serverless, options) {
        // Domain Manager specific properties
        this.domains = [];
        this.serverless = serverless;
        globals_1.default.serverless = serverless;
        this.options = options;
        globals_1.default.options = options;
        this.commands = {
            create_domain: {
                lifecycleEvents: [
                    "create",
                    "initialize",
                ],
                usage: "Creates a domain using the domain name defined in the serverless file",
            },
            delete_domain: {
                lifecycleEvents: [
                    "delete",
                    "initialize",
                ],
                usage: "Deletes a domain using the domain name defined in the serverless file",
            },
        };
        this.hooks = {
            "after:deploy:deploy": this.hookWrapper.bind(this, this.setupBasePathMappings),
            "after:info:info": this.hookWrapper.bind(this, this.domainSummaries),
            "before:deploy:deploy": this.hookWrapper.bind(this, this.createOrGetDomainForCfOutputs),
            "before:remove:remove": this.hookWrapper.bind(this, this.removeBasePathMappings),
            "create_domain:create": this.hookWrapper.bind(this, this.createDomains),
            "delete_domain:delete": this.hookWrapper.bind(this, this.deleteDomains),
        };
    }
    /**
     * Wrapper for lifecycle function, initializes variables and checks if enabled.
     * @param lifecycleFunc lifecycle function that actually does desired action
     */
    hookWrapper(lifecycleFunc) {
        return __awaiter(this, void 0, void 0, function* () {
            // check if `customDomain` or `customDomains` config exists
            this.validateConfigExists();
            // init config variables
            this.initializeVariables();
            // Validate the domain configurations
            this.validateDomainConfigs();
            // setup AWS resources
            this.initAWSResources();
            return yield lifecycleFunc.call(this);
        });
    }
    /**
     * Validate if the plugin config exists
     */
    validateConfigExists() {
        // Make sure customDomain configuration exists, stop if not
        const config = this.serverless.service.custom;
        const domainExists = config && typeof config.customDomain !== "undefined";
        const domainsExists = config && typeof config.customDomains !== "undefined";
        if (typeof config === "undefined" || (!domainExists && !domainsExists)) {
            throw new Error(`${globals_1.default.pluginName}: Plugin configuration is missing.`);
        }
    }
    /**
     * Goes through custom domain property and initializes local variables and cloudformation template
     */
    initializeVariables() {
        const config = this.serverless.service.custom;
        const domainConfig = config.customDomain ? [config.customDomain] : [];
        const domainsConfig = config.customDomains || [];
        const customDomains = domainConfig.concat(domainsConfig);
        // Loop over the domain configurations and populate the domains array with DomainConfigs
        this.domains = [];
        customDomains.forEach((domain) => {
            const apiTypes = Object.keys(globals_1.default.apiTypes);
            const configKeys = Object.keys(domain);
            // If the key of the item in config is an api type it is using per api type domain structure
            if (apiTypes.some((apiType) => configKeys.includes(apiType))) {
                // validate invalid api types
                const invalidApiTypes = configKeys.filter((configType) => !apiTypes.includes(configType));
                if (invalidApiTypes.length) {
                    throw Error(`Invalid API Type(s): ${invalidApiTypes}-${invalidApiTypes.join("; ")}`);
                }
                // init config for each type
                for (const configApiType of configKeys) {
                    const typeConfig = domain[configApiType];
                    typeConfig.apiType = configApiType;
                    this.domains.push(new DomainConfig(typeConfig));
                }
            }
            else { // Default to single domain config
                this.domains.push(new DomainConfig(domain));
            }
        });
        // Filter inactive domains
        this.domains = this.domains.filter((domain) => domain.enabled);
    }
    /**
     * Validates domain configs to make sure they are valid, ie HTTP api cannot be used with EDGE domain
     */
    validateDomainConfigs() {
        this.domains.forEach((domain) => {
            // Show warning if allowPathMatching is set to true
            if (domain.allowPathMatching) {
                globals_1.default.logWarning(`"allowPathMatching" is set for ${domain.givenDomainName}.
                    This should only be used when migrating a path to a different API type. e.g. REST to HTTP.`);
            }
            if (domain.apiType === globals_1.default.apiTypes.rest) {
                // Currently no validation for REST API types
            }
            else if (domain.apiType === globals_1.default.apiTypes.http) { // Validation for http apis
                // HTTP Apis do not support edge domains
                if (domain.endpointType === globals_1.default.endpointTypes.edge) {
                    throw Error(`'edge' endpointType is not compatible with HTTP APIs`);
                }
            }
            else if (domain.apiType === globals_1.default.apiTypes.websocket) { // Validation for WebSocket apis
                // Websocket Apis do not support edge domains
                if (domain.endpointType === globals_1.default.endpointTypes.edge) {
                    throw Error(`'edge' endpointType is not compatible with WebSocket APIs`);
                }
            }
        });
    }
    /**
     * Setup AWS resources
     */
    initAWSResources() {
        const credentials = this.serverless.providers.aws.getCredentials();
        credentials.region = this.serverless.providers.aws.getRegion();
        this.apiGatewayWrapper = new APIGatewayWrapper(credentials);
        this.route53 = new this.serverless.providers.aws.sdk.Route53(credentials);
        this.cloudFormationWrapper = new CloudFormationWrapper(credentials);
    }
    /**
     * Lifecycle function to create a domain
     * Wraps creating a domain and resource record set
     */
    createDomains() {
        return __awaiter(this, void 0, void 0, function* () {
            yield Promise.all(this.domains.map((domain) => __awaiter(this, void 0, void 0, function* () {
                yield this.createDomain(domain);
            })));
        });
    }
    /**
     * Lifecycle function to create a domain
     * Wraps creating a domain and resource record set
     */
    createDomain(domain) {
        return __awaiter(this, void 0, void 0, function* () {
            domain.domainInfo = yield this.apiGatewayWrapper.getCustomDomainInfo(domain);
            try {
                if (!domain.domainInfo) {
                    domain.certificateArn = yield this.getCertArn(domain);
                    yield this.apiGatewayWrapper.createCustomDomain(domain);
                    yield this.changeResourceRecordSet("UPSERT", domain);
                    globals_1.default.logInfo(`Custom domain ${domain.givenDomainName} was created.
                        New domains may take up to 40 minutes to be initialized.`);
                }
                else {
                    globals_1.default.logInfo(`Custom domain ${domain.givenDomainName} already exists.`);
                }
            }
            catch (err) {
                globals_1.default.logError(err, domain.givenDomainName);
                throw new Error(`Unable to create domain ${domain.givenDomainName}`);
            }
        });
    }
    /**
     * Lifecycle function to delete a domain
     * Wraps deleting a domain and resource record set
     */
    deleteDomains() {
        return __awaiter(this, void 0, void 0, function* () {
            yield Promise.all(this.domains.map((domain) => __awaiter(this, void 0, void 0, function* () {
                yield this.deleteDomain(domain);
            })));
        });
    }
    /**
     * Wraps deleting a domain and resource record set
     */
    deleteDomain(domain) {
        return __awaiter(this, void 0, void 0, function* () {
            domain.domainInfo = yield this.apiGatewayWrapper.getCustomDomainInfo(domain);
            try {
                if (domain.domainInfo) {
                    yield this.apiGatewayWrapper.deleteCustomDomain(domain);
                    yield this.changeResourceRecordSet("DELETE", domain);
                    domain.domainInfo = undefined;
                    globals_1.default.logInfo(`Custom domain ${domain.givenDomainName} was deleted.`);
                }
                else {
                    globals_1.default.logInfo(`Custom domain ${domain.givenDomainName} does not exist.`);
                }
            }
            catch (err) {
                globals_1.default.logError(err, domain.givenDomainName);
                throw new Error(`Unable to delete domain ${domain.givenDomainName}`);
            }
        });
    }
    /**
     * Lifecycle function to createDomain before deploy and add domain info to the CloudFormation stack's Outputs
     */
    createOrGetDomainForCfOutputs() {
        return __awaiter(this, void 0, void 0, function* () {
            yield Promise.all(this.domains.map((domain) => __awaiter(this, void 0, void 0, function* () {
                const autoDomain = domain.autoDomain;
                if (autoDomain === true) {
                    globals_1.default.logInfo("Creating domain name before deploy.");
                    yield this.createDomain(domain);
                }
                domain.domainInfo = yield this.apiGatewayWrapper.getCustomDomainInfo(domain);
                if (autoDomain === true) {
                    const atLeastOneDoesNotExist = () => this.domains.some((d) => !d.domainInfo);
                    const maxWaitFor = parseInt(domain.autoDomainWaitFor, 10) || 120;
                    const pollInterval = 3;
                    for (let i = 0; i * pollInterval < maxWaitFor && atLeastOneDoesNotExist() === true; i++) {
                        globals_1.default.logInfo(`
                        Poll #${i + 1}: polling every ${pollInterval} seconds
                        for domain to exist or until ${maxWaitFor} seconds
                        have elapsed before starting deployment
                    `);
                        yield utils_1.sleep(pollInterval);
                        domain.domainInfo = yield this.apiGatewayWrapper.getCustomDomainInfo(domain);
                    }
                }
                this.addOutputs(domain);
            })));
        });
    }
    /**
     * Lifecycle function to create basepath mapping
     * Wraps creation of basepath mapping and adds domain name info as output to cloudformation stack
     */
    setupBasePathMappings() {
        return __awaiter(this, void 0, void 0, function* () {
            yield Promise.all(this.domains.map((domain) => __awaiter(this, void 0, void 0, function* () {
                try {
                    domain.apiId = yield this.getApiId(domain);
                    domain.apiMapping = yield this.apiGatewayWrapper.getBasePathMapping(domain);
                    domain.domainInfo = yield this.apiGatewayWrapper.getCustomDomainInfo(domain);
                    if (!domain.apiMapping) {
                        yield this.apiGatewayWrapper.createBasePathMapping(domain);
                    }
                    else {
                        yield this.apiGatewayWrapper.updateBasePathMapping(domain);
                    }
                }
                catch (err) {
                    globals_1.default.logError(err, domain.givenDomainName);
                    throw new Error(`Unable to setup base domain mappings for ${domain.givenDomainName}`);
                }
            }))).then(() => {
                // Print summary upon completion
                this.domains.forEach((domain) => {
                    globals_1.default.printDomainSummary(domain);
                });
            });
        });
    }
    /**
     * Lifecycle function to delete basepath mapping
     * Wraps deletion of basepath mapping
     */
    removeBasePathMappings() {
        return __awaiter(this, void 0, void 0, function* () {
            yield Promise.all(this.domains.map((domain) => __awaiter(this, void 0, void 0, function* () {
                try {
                    domain.apiId = yield this.getApiId(domain);
                    // Unable to find the corresponding API, manual clean up will be required
                    if (!domain.apiId) {
                        globals_1.default.logInfo(`Unable to find corresponding API for ${domain.givenDomainName},
                        API Mappings may need to be manually removed.`);
                    }
                    else {
                        domain.apiMapping = yield this.apiGatewayWrapper.getBasePathMapping(domain);
                        yield this.apiGatewayWrapper.deleteBasePathMapping(domain);
                    }
                }
                catch (err) {
                    if (err.message.indexOf("Failed to find CloudFormation") > -1) {
                        globals_1.default.logInfo(`Unable to find Cloudformation Stack for ${domain.givenDomainName},
                        API Mappings may need to be manually removed.`);
                    }
                    else {
                        globals_1.default.logError(err, domain.givenDomainName);
                        globals_1.default.logError(`Unable to remove base path mappings`, domain.givenDomainName, false);
                    }
                }
                const autoDomain = domain.autoDomain;
                if (autoDomain === true) {
                    globals_1.default.logInfo("Deleting domain name after removing base path mapping.");
                    yield this.deleteDomain(domain);
                }
            })));
        });
    }
    /**
     * Lifecycle function to print domain summary
     * Wraps printing of all domain manager related info
     */
    domainSummaries() {
        return __awaiter(this, void 0, void 0, function* () {
            for (const domain of this.domains) {
                domain.domainInfo = yield this.apiGatewayWrapper.getCustomDomainInfo(domain);
                if (domain.domainInfo) {
                    globals_1.default.printDomainSummary(domain);
                }
                else {
                    globals_1.default.logInfo(`Unable to print Serverless Domain Manager Summary for ${domain.givenDomainName}`);
                }
            }
        });
    }
    /**
     * Gets Certificate ARN that most closely matches domain name OR given Cert ARN if provided
     */
    getCertArn(domain) {
        return __awaiter(this, void 0, void 0, function* () {
            if (domain.certificateArn) {
                globals_1.default.logInfo(`Selected specific certificateArn ${domain.certificateArn}`);
                return domain.certificateArn;
            }
            let certificateArn; // The arn of the selected certificate
            let certificateName = domain.certificateName; // The certificate name
            try {
                const certificates = yield utils_1.getAWSPagedResults(domain.acm, "listCertificates", "CertificateSummaryList", "NextToken", "NextToken", { CertificateStatuses: certStatuses });
                // The more specific name will be the longest
                let nameLength = 0;
                // Checks if a certificate name is given
                if (certificateName != null) {
                    const foundCertificate = certificates
                        .find((certificate) => (certificate.DomainName === certificateName));
                    if (foundCertificate != null) {
                        certificateArn = foundCertificate.CertificateArn;
                    }
                }
                else {
                    certificateName = domain.givenDomainName;
                    certificates.forEach((certificate) => {
                        let certificateListName = certificate.DomainName;
                        // Looks for wild card and takes it out when checking
                        if (certificateListName[0] === "*") {
                            certificateListName = certificateListName.substr(1);
                        }
                        // Looks to see if the name in the list is within the given domain
                        // Also checks if the name is more specific than previous ones
                        if (certificateName.includes(certificateListName)
                            && certificateListName.length > nameLength) {
                            nameLength = certificateListName.length;
                            certificateArn = certificate.CertificateArn;
                        }
                    });
                }
            }
            catch (err) {
                globals_1.default.logError(err, domain.givenDomainName);
                throw Error(`Could not list certificates in Certificate Manager.\n${err}`);
            }
            if (certificateArn == null) {
                throw Error(`Could not find the certificate ${certificateName}.`);
            }
            return certificateArn;
        });
    }
    /**
     * Change A Alias record through Route53 based on given action
     * @param action: String descriptor of change to be made. Valid actions are ['UPSERT', 'DELETE']
     * @param domain: DomainInfo object containing info about custom domain
     */
    changeResourceRecordSet(action, domain) {
        return __awaiter(this, void 0, void 0, function* () {
            if (action !== "UPSERT" && action !== "DELETE") {
                throw new Error(`Invalid action "${action}" when changing Route53 Record.
                Action must be either UPSERT or DELETE.\n`);
            }
            const createRoute53Record = domain.createRoute53Record;
            if (createRoute53Record !== undefined && createRoute53Record === false) {
                globals_1.default.logInfo(`Skipping ${action === "DELETE" ? "removal" : "creation"} of Route53 record.`);
                return;
            }
            // Set up parameters
            const route53HostedZoneId = yield this.getRoute53HostedZoneId(domain);
            const Changes = ["A", "AAAA"].map((Type) => ({
                Action: action,
                ResourceRecordSet: {
                    AliasTarget: {
                        DNSName: domain.domainInfo.domainName,
                        EvaluateTargetHealth: false,
                        HostedZoneId: domain.domainInfo.hostedZoneId,
                    },
                    Name: domain.givenDomainName,
                    Type,
                },
            }));
            const params = {
                ChangeBatch: {
                    Changes,
                    Comment: "Record created by serverless-domain-manager",
                },
                HostedZoneId: route53HostedZoneId,
            };
            // Make API call
            try {
                yield utils_1.throttledCall(this.route53, "changeResourceRecordSets", params);
            }
            catch (err) {
                globals_1.default.logError(err, domain.givenDomainName);
                throw new Error(`Failed to ${action} A Alias for ${domain.givenDomainName}\n`);
            }
        });
    }
    /**
     * Gets Route53 HostedZoneId from user or from AWS
     */
    getRoute53HostedZoneId(domain) {
        return __awaiter(this, void 0, void 0, function* () {
            if (domain.hostedZoneId) {
                globals_1.default.logInfo(`Selected specific hostedZoneId ${domain.hostedZoneId}`);
                return domain.hostedZoneId;
            }
            const filterZone = domain.hostedZonePrivate !== undefined;
            if (filterZone && domain.hostedZonePrivate) {
                globals_1.default.logInfo("Filtering to only private zones.");
            }
            else if (filterZone && !domain.hostedZonePrivate) {
                globals_1.default.logInfo("Filtering to only public zones.");
            }
            let hostedZoneData;
            const givenDomainNameReverse = domain.givenDomainName.split(".").reverse();
            try {
                hostedZoneData = yield utils_1.throttledCall(this.route53, "listHostedZones", {});
                const targetHostedZone = hostedZoneData.HostedZones
                    .filter((hostedZone) => {
                    let hostedZoneName;
                    if (hostedZone.Name.endsWith(".")) {
                        hostedZoneName = hostedZone.Name.slice(0, -1);
                    }
                    else {
                        hostedZoneName = hostedZone.Name;
                    }
                    if (!filterZone || domain.hostedZonePrivate === hostedZone.Config.PrivateZone) {
                        const hostedZoneNameReverse = hostedZoneName.split(".").reverse();
                        if (givenDomainNameReverse.length === 1
                            || (givenDomainNameReverse.length >= hostedZoneNameReverse.length)) {
                            for (let i = 0; i < hostedZoneNameReverse.length; i += 1) {
                                if (givenDomainNameReverse[i] !== hostedZoneNameReverse[i]) {
                                    return false;
                                }
                            }
                            return true;
                        }
                    }
                    return false;
                })
                    .sort((zone1, zone2) => zone2.Name.length - zone1.Name.length)
                    .shift();
                if (targetHostedZone) {
                    const hostedZoneId = targetHostedZone.Id;
                    // Extracts the hostzone Id
                    const startPos = hostedZoneId.indexOf("e/") + 2;
                    const endPos = hostedZoneId.length;
                    return hostedZoneId.substring(startPos, endPos);
                }
            }
            catch (err) {
                globals_1.default.logError(err, domain.givenDomainName);
                throw new Error(`Unable to list hosted zones in Route53.\n${err}`);
            }
            throw new Error(`Could not find hosted zone "${domain.givenDomainName}"`);
        });
    }
    /**
     * Gets rest API id from existing config or CloudFormation stack
     */
    getApiId(domain) {
        return __awaiter(this, void 0, void 0, function* () {
            const apiGateway = this.serverless.service.provider.apiGateway || {};
            const apiIdKey = globals_1.default.gatewayAPIIdKeys[domain.apiType];
            const apiId = apiGateway[apiIdKey];
            const stackName = this.serverless.service.provider.stackName ||
                `${this.serverless.service.service}-${domain.stage}`;
            if (apiId) {
                // if string value exists return the value
                if (typeof apiId === "string") {
                    globals_1.default.logInfo(`Mapping custom domain to existing API  ${apiId}.`);
                    return apiId;
                }
                // in case object and Fn::ImportValue try to get restApiId from the CloudFormation exports
                if (typeof apiId === "object" && apiId["Fn::ImportValue"]) {
                    const importName = apiId["Fn::ImportValue"];
                    let importValues;
                    try {
                        importValues = yield this.cloudFormationWrapper.getImportValues([importName]);
                    }
                    catch (err) {
                        globals_1.default.logError(err, domain.givenDomainName);
                        throw new Error(`Failed to find CloudFormation ImportValue by ${importName}\n`);
                    }
                    if (!importValues[importName]) {
                        throw new Error(`CloudFormation ImportValue not found by ${importName}\n`);
                    }
                    return importValues[importName];
                }
                if (typeof apiId === "object" && apiId.Ref) {
                    try {
                        return yield this.cloudFormationWrapper.getApiId(domain, stackName, apiId.Ref);
                    }
                    catch (err) {
                        globals_1.default.logError(err, domain.givenDomainName);
                        throw new Error(`Failed to find CloudFormation resources for ${domain.givenDomainName}\n`);
                    }
                }
                // throw an exception in case not supported restApiId
                throw new Error("Unsupported apiGateway.restApiId object");
            }
            try {
                return yield this.cloudFormationWrapper.getApiId(domain, stackName);
            }
            catch (err) {
                globals_1.default.logError(err, domain.givenDomainName);
                throw new Error(`Failed to find CloudFormation resources for ${domain.givenDomainName}\n`);
            }
        });
    }
    /**
     *  Adds the domain name and distribution domain name to the CloudFormation outputs
     */
    addOutputs(domain) {
        const service = this.serverless.service;
        if (!service.provider.compiledCloudFormationTemplate.Outputs) {
            service.provider.compiledCloudFormationTemplate.Outputs = {};
        }
        // Defaults for REST and backwards compatibility
        let distributionDomainNameOutputKey = "DistributionDomainName";
        let domainNameOutputKey = "DomainName";
        let hostedZoneIdOutputKey = "HostedZoneId";
        if (domain.apiType === globals_1.default.apiTypes.http) {
            distributionDomainNameOutputKey += "Http";
            domainNameOutputKey += "Http";
            hostedZoneIdOutputKey += "Http";
        }
        else if (domain.apiType === globals_1.default.apiTypes.websocket) {
            distributionDomainNameOutputKey += "Websocket";
            domainNameOutputKey += "Websocket";
            hostedZoneIdOutputKey += "Websocket";
        }
        service.provider.compiledCloudFormationTemplate.Outputs[distributionDomainNameOutputKey] = {
            Value: domain.domainInfo.domainName,
        };
        service.provider.compiledCloudFormationTemplate.Outputs[domainNameOutputKey] = {
            Value: domain.givenDomainName,
        };
        if (domain.domainInfo.hostedZoneId) {
            service.provider.compiledCloudFormationTemplate.Outputs[hostedZoneIdOutputKey] = {
                Value: domain.domainInfo.hostedZoneId,
            };
        }
    }
}
module.exports = ServerlessCustomDomain;
