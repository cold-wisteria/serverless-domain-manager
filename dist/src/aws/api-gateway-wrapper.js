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
const DomainInfo = require("../domain-info");
const globals_1 = require("../globals");
const aws_sdk_1 = require("aws-sdk"); // tslint:disable-line
const utils_1 = require("../utils");
class APIGatewayWrapper {
    constructor(credentials) {
        this.apiGateway = new aws_sdk_1.APIGateway(credentials);
        this.apiGatewayV2 = new aws_sdk_1.ApiGatewayV2(credentials);
    }
    /**
     * Creates Custom Domain Name through API Gateway
     * @param domain: DomainConfig
     */
    createCustomDomain(domain) {
        return __awaiter(this, void 0, void 0, function* () {
            let createdDomain = {};
            // For EDGE domain name or TLS 1.0, create with APIGateway (v1)
            if (domain.endpointType === globals_1.default.endpointTypes.edge || domain.securityPolicy === "TLS_1_0") {
                // Set up parameters
                const params = {
                    domainName: domain.givenDomainName,
                    endpointConfiguration: {
                        types: [domain.endpointType],
                    },
                    securityPolicy: domain.securityPolicy,
                };
                /* tslint:disable:no-string-literal */
                if (domain.endpointType === globals_1.default.endpointTypes.edge) {
                    params["certificateArn"] = domain.certificateArn;
                }
                else {
                    params["regionalCertificateArn"] = domain.certificateArn;
                }
                /* tslint:enable:no-string-literal */
                // Make API call to create domain
                try {
                    // Creating EDGE domain so use APIGateway (v1) service
                    createdDomain = yield utils_1.throttledCall(this.apiGateway, "createDomainName", params);
                    domain.domainInfo = new DomainInfo(createdDomain);
                }
                catch (err) {
                    globals_1.default.logError(err, domain.givenDomainName);
                    throw new Error(`Failed to create custom domain ${domain.givenDomainName}\n`);
                }
            }
            else { // For Regional domain name create with ApiGatewayV2
                const params = {
                    DomainName: domain.givenDomainName,
                    DomainNameConfigurations: [{
                            CertificateArn: domain.certificateArn,
                            EndpointType: domain.endpointType,
                            SecurityPolicy: domain.securityPolicy,
                        }],
                };
                // Make API call to create domain
                try {
                    // Creating Regional domain so use ApiGatewayV2
                    createdDomain = yield utils_1.throttledCall(this.apiGatewayV2, "createDomainName", params);
                    domain.domainInfo = new DomainInfo(createdDomain);
                }
                catch (err) {
                    globals_1.default.logError(err, domain.givenDomainName);
                    throw new Error(`Failed to create custom domain ${domain.givenDomainName}\n`);
                }
            }
        });
    }
    /**
     * Delete Custom Domain Name through API Gateway
     */
    deleteCustomDomain(domain) {
        return __awaiter(this, void 0, void 0, function* () {
            // Make API call
            try {
                yield utils_1.throttledCall(this.apiGatewayV2, "deleteDomainName", {
                    DomainName: domain.givenDomainName,
                });
            }
            catch (err) {
                globals_1.default.logError(err, domain.givenDomainName);
                throw new Error(`Failed to delete custom domain ${domain.givenDomainName}\n`);
            }
        });
    }
    /**
     * Get Custom Domain Info through API Gateway
     */
    getCustomDomainInfo(domain) {
        return __awaiter(this, void 0, void 0, function* () {
            // Make API call
            try {
                const domainInfo = yield utils_1.throttledCall(this.apiGatewayV2, "getDomainName", {
                    DomainName: domain.givenDomainName,
                });
                return new DomainInfo(domainInfo);
            }
            catch (err) {
                if (err.code !== "NotFoundException") {
                    globals_1.default.logError(err, domain.givenDomainName);
                    throw new Error(`Unable to fetch information about ${domain.givenDomainName}`);
                }
                globals_1.default.logError(`${domain.givenDomainName} does not exist`);
            }
        });
    }
    /**
     * Creates basepath mapping
     */
    createBasePathMapping(domain) {
        return __awaiter(this, void 0, void 0, function* () {
            // Use APIGateway (v1) for EDGE or TLS 1.0 domains
            if (domain.endpointType === globals_1.default.endpointTypes.edge || domain.securityPolicy === "TLS_1_0") {
                const params = {
                    basePath: domain.basePath,
                    domainName: domain.givenDomainName,
                    restApiId: domain.apiId,
                    stage: domain.stage,
                };
                // Make API call
                try {
                    yield utils_1.throttledCall(this.apiGateway, "createBasePathMapping", params);
                    globals_1.default.logInfo(`Created API mapping '${domain.basePath}' for ${domain.givenDomainName}`);
                }
                catch (err) {
                    globals_1.default.logError(err, domain.givenDomainName);
                    throw new Error(`${domain.givenDomainName}: Unable to create basepath mapping.\n`);
                }
            }
            else { // Use ApiGatewayV2 for Regional domains
                const params = {
                    ApiId: domain.apiId,
                    ApiMappingKey: domain.basePath,
                    DomainName: domain.givenDomainName,
                    Stage: domain.apiType === globals_1.default.apiTypes.http ? "$default" : domain.stage,
                };
                // Make API call
                try {
                    yield utils_1.throttledCall(this.apiGatewayV2, "createApiMapping", params);
                    globals_1.default.logInfo(`Created API mapping '${domain.basePath}' for ${domain.givenDomainName}`);
                }
                catch (err) {
                    globals_1.default.logError(err, domain.givenDomainName);
                    throw new Error(`${domain.givenDomainName}: Unable to create basepath mapping.\n`);
                }
            }
        });
    }
    /**
     * Get basepath mapping
     */
    getBasePathMapping(domain) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const mappings = yield utils_1.getAWSPagedResults(this.apiGatewayV2, "getApiMappings", "Items", "NextToken", "NextToken", { DomainName: domain.givenDomainName });
                for (const mapping of mappings) {
                    if (mapping.ApiId === domain.apiId
                        || (mapping.ApiMappingKey === domain.basePath && domain.allowPathMatching)) {
                        return mapping;
                    }
                }
            }
            catch (err) {
                globals_1.default.logError(err, domain.givenDomainName);
                throw new Error(`Unable to get API Mappings for ${domain.givenDomainName}`);
            }
        });
    }
    /**
     * Updates basepath mapping
     */
    updateBasePathMapping(domain) {
        return __awaiter(this, void 0, void 0, function* () {
            // Use APIGateway (v1) for EDGE or TLS 1.0 domains
            // check here if the EXISTING domain is using TLS 1.0 regardless of what is configured
            // We don't support updating custom domains so switching from TLS 1.0 to 1.2 will require recreating
            // the domain
            if (domain.endpointType === globals_1.default.endpointTypes.edge || domain.domainInfo.securityPolicy === "TLS_1_0") {
                const params = {
                    basePath: domain.apiMapping.ApiMappingKey || "(none)",
                    domainName: domain.givenDomainName,
                    patchOperations: [
                        {
                            op: "replace",
                            path: "/basePath",
                            value: domain.basePath,
                        },
                    ],
                };
                // Make API call
                try {
                    yield utils_1.throttledCall(this.apiGateway, "updateBasePathMapping", params);
                    globals_1.default.logInfo(`Updated API mapping from '${domain.apiMapping.ApiMappingKey}'
                     to '${domain.basePath}' for ${domain.givenDomainName}`);
                }
                catch (err) {
                    globals_1.default.logError(err, domain.givenDomainName);
                    throw new Error(`${domain.givenDomainName}: Unable to update basepath mapping.\n`);
                }
            }
            else { // Use ApiGatewayV2 for Regional domains
                const params = {
                    ApiId: domain.apiId,
                    ApiMappingId: domain.apiMapping.ApiMappingId,
                    ApiMappingKey: domain.basePath,
                    DomainName: domain.givenDomainName,
                    Stage: domain.apiType === globals_1.default.apiTypes.http ? "$default" : domain.stage,
                };
                // Make API call
                try {
                    yield utils_1.throttledCall(this.apiGatewayV2, "updateApiMapping", params);
                    globals_1.default.logInfo(`Updated API mapping to '${domain.basePath}' for ${domain.givenDomainName}`);
                }
                catch (err) {
                    globals_1.default.logError(err, domain.givenDomainName);
                    throw new Error(`${domain.givenDomainName}: Unable to update basepath mapping.\n`);
                }
            }
        });
    }
    /**
     * Deletes basepath mapping
     */
    deleteBasePathMapping(domain) {
        return __awaiter(this, void 0, void 0, function* () {
            const params = {
                ApiMappingId: domain.apiMapping.ApiMappingId,
                DomainName: domain.givenDomainName,
            };
            // Make API call
            try {
                yield utils_1.throttledCall(this.apiGatewayV2, "deleteApiMapping", params);
                globals_1.default.logInfo("Removed basepath mapping.");
            }
            catch (err) {
                globals_1.default.logError(err, domain.givenDomainName);
                globals_1.default.logInfo(`Unable to remove basepath mapping for ${domain.givenDomainName}`);
            }
        });
    }
}
module.exports = APIGatewayWrapper;
