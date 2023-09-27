/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Ivan Kopeykin @vankop
*/

"use strict";

const forEachBail = require("./forEachBail");

/** @typedef {import("./Resolver")} Resolver */
/** @typedef {import("./Resolver").ResolveRequest} ResolveRequest */
/** @typedef {import("./Resolver").ResolveStepHook} ResolveStepHook */
/** @typedef {{ alias: string|string[], extension: string }} ExtensionAliasOption */

module.exports = class ExtensionAliasPlugin {
	/**
	 * @param {string | ResolveStepHook} source source
	 * @param {ExtensionAliasOption} options options
	 * @param {string | ResolveStepHook} target target
	 */
	constructor(source, options, target) {
		this.source = source;
		this.options = options;
		this.target = target;
	}

	/**
	 * @param {Resolver} resolver the resolver
	 * @returns {void}
	 */
	apply(resolver) {
		const target = resolver.ensureHook(this.target);
		const { extension, alias } = this.options;
		resolver
			.getHook(this.source)
			.tapAsync("ExtensionAliasPlugin", (request, resolveContext, callback) => {
				const requestPath = request.request;
				if (!requestPath || !requestPath.endsWith(extension)) return callback();
				const resolve = (alias, callback) => {
					// 改写 request，将原有的扩展名替换掉，重新执行 resolve
					resolver.doResolve(
						target,
						{
							...request,
							request: `${requestPath.slice(0, -extension.length)}${alias}`, // 改写原理
							fullySpecified: true
						},
						`aliased from extension alias with mapping '${extension}' to '${alias}'`,
						resolveContext,
						callback
					);
				};

				// 停止回调函数
				const stoppingCallback = (err, result) => {
					if (err) return callback(err);
					if (result) return callback(null, result);
					// Don't allow other aliasing or raw request
					return callback(null, null);
				};
				// 根据 alias 配置不同情况处理
				// 1. alias 配置是一个字符串 extension: '.js', alias: '.ts'
				if (typeof alias === "string") {
					resolve(alias, stoppingCallback);
				} else if (alias.length > 1) {
					// 2. alias 配置一个数组且长度大于1： extension '.js' alias: ['.jsx', '.tsx', '.mjs']
					forEachBail(alias, resolve, stoppingCallback);
				} else {
					// 3. alias 配置一个数组长度<= 1 的情况：extension '.js' alias: ['.jsx']
					resolve(alias[0], stoppingCallback);
				}
			});
	}
};
