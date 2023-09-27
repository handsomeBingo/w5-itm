/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/

"use strict";

/** @typedef {import("./Resolver")} Resolver */
/** @typedef {import("./Resolver").ResolveStepHook} ResolveStepHook */

module.exports = class JoinRequestPlugin {
	/**
	 * @param {string | ResolveStepHook} source source
	 * @param {string | ResolveStepHook} target target
	 */
	constructor(source, target) {
		this.source = source;
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
			.tapAsync("JoinRequestPlugin", (request, resolveContext, callback) => {
				const obj = {
					...request,
					path: resolver.join(request.path, request.request), // request.path 就是webpack 的 context 目录？拼接之后就不是了。。。就是当前请求的目录了
					relativePath: // 如果有 relativePath 就改写一次拼接当前的 request
						request.relativePath &&
						resolver.join(request.relativePath, request.request),
					request: undefined // 置空原始 request
				};
				resolver.doResolve(target, obj, null, resolveContext, callback);
			});
	}
};
