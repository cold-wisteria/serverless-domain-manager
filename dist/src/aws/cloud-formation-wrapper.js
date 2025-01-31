"use strict";
/**
 * Wrapper class for AWS CloudFormation provider
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
const aws_sdk_1 = require("aws-sdk");
const globals_1 = require("../globals");
const utils_1 = require("../utils");
class CloudFormationWrapper {
    constructor(credentials) {
        this.cloudFormation = new aws_sdk_1.CloudFormation(credentials);
    }
    /**
     * Gets rest API id from CloudFormation stack or nested stack
     */
    getApiId(domain, stackName, logicalResourceId) {
        return __awaiter(this, void 0, void 0, function* () {
            let _logicalResourceId = "ApiGatewayRestApi";
            if (domain.apiType === globals_1.default.apiTypes.http) {
                _logicalResourceId = "HttpApi";
            }
            if (domain.apiType === globals_1.default.apiTypes.websocket) {
                _logicalResourceId = "WebsocketsApi";
            }
            _logicalResourceId = logicalResourceId !== null && logicalResourceId !== void 0 ? logicalResourceId : _logicalResourceId;
            let response;
            try {
                // trying to get information for specified stack name
                response = yield this.getStack(_logicalResourceId, stackName);
            }
            catch (_a) {
                // in case error trying to get information from the some of nested stacks
                response = yield this.getNestedStack(_logicalResourceId, stackName);
            }
            if (!response) {
                throw new Error(`Failed to find a stack ${stackName}\n`);
            }
            const apiId = response.StackResourceDetail.PhysicalResourceId;
            if (!apiId) {
                throw new Error(`No ApiId associated with CloudFormation stack ${stackName}`);
            }
            globals_1.default.logInfo(`Found apiId: ${apiId} for ${domain.givenDomainName}`);
            return apiId;
        });
    }
    /**
     * Gets values by names from cloudformation exports
     */
    getImportValues(names) {
        return __awaiter(this, void 0, void 0, function* () {
            const exports = yield utils_1.getAWSPagedResults(this.cloudFormation, "listExports", "Exports", "NextToken", "NextToken", {});
            // filter Exports by names which we need
            const filteredExports = exports.filter((item) => names.indexOf(item.Name) !== -1);
            // converting a list of unique values to dict
            // [{Name: "export-name", Value: "export-value"}, ...] - > {"export-name": "export-value"}
            return filteredExports.reduce((prev, current) => (Object.assign(Object.assign({}, prev), { [current.Name]: current.Value })), {});
        });
    }
    /**
     * Returns a description of the specified resource in the specified stack.
     */
    getStack(logicalResourceId, stackName) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                return yield utils_1.throttledCall(this.cloudFormation, "describeStackResource", {
                    LogicalResourceId: logicalResourceId,
                    StackName: stackName,
                });
            }
            catch (err) {
                throw new Error(`Failed to find CloudFormation resources with an error: ${err}\n`);
            }
        });
    }
    /**
     * Returns a description of the specified resource in the specified nested stack.
     */
    getNestedStack(logicalResourceId, stackName) {
        return __awaiter(this, void 0, void 0, function* () {
            // get all stacks from the CloudFormation
            const stacks = yield utils_1.getAWSPagedResults(this.cloudFormation, "describeStacks", "Stacks", "NextToken", "NextToken", {});
            // filter stacks by given stackName and check by nested stack RootId
            const regex = new RegExp(`\/${stackName}\/`);
            const filteredStackNames = stacks
                .reduce((acc, stack) => {
                if (!stack.RootId) {
                    return acc;
                }
                const match = stack.RootId.match(regex);
                if (match) {
                    acc.push(stack.StackName);
                }
                return acc;
            }, []);
            let response;
            for (const name of filteredStackNames) {
                try {
                    response = yield this.getStack(logicalResourceId, name);
                    break;
                }
                catch (err) {
                    globals_1.default.logError(err);
                }
            }
            return response;
        });
    }
}
module.exports = CloudFormationWrapper;
