/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/

"use strict";

/** @typedef {import("./Resolver")} Resolver */
/** @typedef {import("./Resolver").ResolveStepHook} ResolveStepHook */

module.exports = class UseFilePlugin {
	/**
	 * @param {string | ResolveStepHook} source source
	 * @param {string} filename filename
	 * @param {string | ResolveStepHook} target target
	 */
	constructor(source, filename, target) {
		this.source = source;
		this.filename = filename;
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
			.tapAsync("UseFilePlugin", (request, resolveContext, callback) => {
				// 处理导入目录时自动解析到目录下的 index.js；
				// resolve.mainFiles: ['index.js']
				// 构造文件名：
				const filePath = resolver.join(request.path, this.filename);
				const obj = {
					...request,
					path: filePath,
					relativePath:
						request.relativePath &&
						resolver.join(request.relativePath, this.filename)
				};
				resolver.doResolve(
					target,
					obj,
					"using path: " + filePath,
					resolveContext,
					callback
				);
			});
	}
};
