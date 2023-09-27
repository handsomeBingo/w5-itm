/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/

"use strict";

const DescriptionFileUtils = require("./DescriptionFileUtils");
const getInnerRequest = require("./getInnerRequest");

/** @typedef {import("./Resolver")} Resolver */
/** @typedef {import("./Resolver").ResolveRequest} ResolveRequest */
/** @typedef {import("./Resolver").ResolveStepHook} ResolveStepHook */

module.exports = class AliasFieldPlugin {
	/**
	 * @param {string | ResolveStepHook} source source
	 * @param {string | Array<string>} field field
	 * @param {string | ResolveStepHook} target target
	 */
	constructor(source, field, target) {
		this.source = source;
		this.field = field;
		this.target = target;
	}

	/**
	 * @param {Resolver} resolver the resolver
	 * @returns {void}
	 */
	apply(resolver) {
		const target = resolver.ensureHook(this.target);
		resolver
			.getHook(this.source)
			.tapAsync("AliasFieldPlugin", (request, resolveContext, callback) => {
				if (!request.descriptionFileData) return callback();
				const innerRequest = getInnerRequest(resolver, request);
				if (!innerRequest) return callback();

				// fileData 就是 npm 包的 package.json.browser 等字段对象：
				// 形如：{ name: 'xxx', browser: 'lib/browser-only.js' } 替换掉模块的 main 整个入口模块
				// 形如：{ name: 'xxx', browser: { './some-server-use.js': './some-client-use.js' } } 在浏览器环境下如果 require('xxx/some-server-use.js') 需要替换成 xxx/some-client-use.js 这个插件的工作就是干着的
				const fieldData = DescriptionFileUtils.getField(
					request.descriptionFileData,
					this.field
				);
				if (fieldData === null || typeof fieldData !== "object") {
					// 没有这个字段退出
					if (resolveContext.log)
						resolveContext.log(
							"Field '" +
								this.field +
								"' doesn't contain a valid alias configuration"
						);
					return callback();
				}

				// 这个就是 Obj.hasOwnProperty()
				const data = Object.prototype.hasOwnProperty.call(
					fieldData,
					innerRequest
				)
					? fieldData[innerRequest]
					: innerRequest.startsWith("./") // 处理相对路径 './some-server-use.js' 变成 'some-server-use.js'
					? fieldData[innerRequest.slice(2)]
					: undefined; // 没找到
				if (data === innerRequest) return callback();
				if (data === undefined) return callback();
				if (data === false) { // 屏蔽某些模块引用这个是规范的一部分
					/** @type {ResolveRequest} */
					const ignoreObj = {
						...request,
						path: false
					};
					if (typeof resolveContext.yield === "function") {
						resolveContext.yield(ignoreObj);
						return callback(null, null);
					}
					return callback(null, ignoreObj);
				}
				const obj = {
					...request,
					path: request.descriptionFileRoot,
					request: data,
					fullySpecified: false
				};
				resolver.doResolve(
					target,
					obj,
					"aliased from description file " +
						request.descriptionFilePath +
						" with mapping '" +
						innerRequest +
						"' to '" +
						data +
						"'",
					resolveContext,
					(err, result) => {
						if (err) return callback(err);

						// Don't allow other aliasing or raw request
						if (result === undefined) return callback(null, null);
						callback(null, result);
					}
				);
			});
	}
};
