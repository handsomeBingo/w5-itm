/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/

"use strict";

const forEachBail = require("./forEachBail");
const { PathType, getType } = require("./util/path");

/** @typedef {import("./Resolver")} Resolver */
/** @typedef {import("./Resolver").ResolveRequest} ResolveRequest */
/** @typedef {import("./Resolver").ResolveStepHook} ResolveStepHook */
/** @typedef {{alias: string|Array<string>|false, name: string, onlyModule?: boolean}} AliasOption */

module.exports = class AliasPlugin {
	/**
	 * @param {string | ResolveStepHook} source source
	 * @param {AliasOption | Array<AliasOption>} options options
	 * @param {string | ResolveStepHook} target target
	 */
	constructor(source, options, target) {
		this.source = source;
		this.options = Array.isArray(options) ? options : [options];
		this.target = target;
	}

	/**
	 * @param {Resolver} resolver the resolver
	 * @returns {void}
	 */
	apply(resolver) {
		const target = resolver.ensureHook(this.target);
		const getAbsolutePathWithSlashEnding = maybeAbsolutePath => {
			const type = getType(maybeAbsolutePath);
			if (type === PathType.AbsolutePosix || type === PathType.AbsoluteWin) {
				return resolver.join(maybeAbsolutePath, "_").slice(0, -1);
			}
			return null;
		};
		const isSubPath = (path, maybeSubPath) => {
			const absolutePath = getAbsolutePathWithSlashEnding(maybeSubPath);
			if (!absolutePath) return false;
			return path.startsWith(absolutePath);
		};
		resolver
			.getHook(this.source)
			.tapAsync("AliasPlugin", (request, resolveContext, callback) => {
				const innerRequest = request.request || request.path;
				if (!innerRequest) return callback();
				forEachBail(
					this.options, // options 是 fallback 数组
					(item, callback) => {
						let shouldStop = false;
						if (
							innerRequest === item.name ||
							(!item.onlyModule &&
								(request.request
									? innerRequest.startsWith(`${item.name}/`) // 如果有 request.request 就要判断是否以别名开头，'Src/s/a' Src 就是别名
									: isSubPath(innerRequest, item.name)))
						) {
							const remainingRequest = innerRequest.substr(item.name.length); // 除了 alias 以外的别名 Src/s/a 的 remainingRequest 为 /s/a
							const resolveWithAlias = (alias, callback) => { // 这个 alias 入参是真实路径，callback 是 stoppingCallback 函数
								if (alias === false) {
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
								if (
									innerRequest !== alias &&
									!innerRequest.startsWith(alias + "/") // innerRequest 是带有 别名 的 request 字符串，这个字符串不是以真实路径开头，如果是以alias（真实路径）开头的就没必要走下面的流程了
								) {
									shouldStop = true;
									const newRequestStr = alias + remainingRequest;
									const obj = {
										...request,
										request: newRequestStr,
										fullySpecified: false
									};
									return resolver.doResolve(
										target,
										obj,
										"aliased with mapping '" +
											item.name +
											"': '" +
											alias +
											"' to '" +
											newRequestStr +
											"'",
										resolveContext,
										(err, result) => { // 这下面的 callback 都是 stoppingCallback
											if (err) return callback(err);
											if (result) return callback(null, result);
											return callback();
										}
									);
								}
								return callback();
							};
							const stoppingCallback = (err, result) => {
								// 这里面的 callback 是 forEachBail 的控制下一个的 callback
								if (err) return callback(err);

								if (result) return callback(null, result);
								// Don't allow other aliasing or raw request
								if (shouldStop) return callback(null, null);
								return callback();
							};
							if (Array.isArray(item.alias)) {
								return forEachBail(
									item.alias,
									resolveWithAlias,
									stoppingCallback
								);
							} else {
								return resolveWithAlias(item.alias, stoppingCallback);
							}
						}
						return callback(); // 这个 callback 是 forEachBail 的下一个 callback
					},
					callback
				);
			});
	}
};
