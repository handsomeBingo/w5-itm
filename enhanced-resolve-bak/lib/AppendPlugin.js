/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/

"use strict";

/** @typedef {import("./Resolver")} Resolver */
/** @typedef {import("./Resolver").ResolveStepHook} ResolveStepHook */

module.exports = class AppendPlugin {
	/**
	 * @param {string | ResolveStepHook} source source
	 * @param {string} appending appending
	 * @param {string | ResolveStepHook} target target
	 */
	constructor(source, appending, target) {
		this.source = source;
		this.appending = appending;
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
			.tapAsync("AppendPlugin", (request, resolveContext, callback) => {
				const obj = {
					...request,
					path: request.path + this.appending, // 追加扩展名
					relativePath:
						request.relativePath && request.relativePath + this.appending // 追加扩展名
				};
				resolver.doResolve(
					target,
					obj,
					this.appending,
					resolveContext,
					callback
				);
			});
	}
};
