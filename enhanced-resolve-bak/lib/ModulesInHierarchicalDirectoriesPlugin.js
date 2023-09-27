/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/

"use strict";

const forEachBail = require("./forEachBail");
const getPaths = require("./getPaths");

/** @typedef {import("./Resolver")} Resolver */
/** @typedef {import("./Resolver").ResolveStepHook} ResolveStepHook */

module.exports = class ModulesInHierarchicalDirectoriesPlugin {
	/**
	 * @param {string | ResolveStepHook} source source
	 * @param {string | Array<string>} directories directories
	 * @param {string | ResolveStepHook} target target
	 */
	constructor(source, directories, target) {
		this.source = source;
		this.directories = /** @type {Array<string>} */ ([]).concat(directories);
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
			.tapAsync(
				"ModulesInHierarchicalDirectoriesPlugin",
				(request, resolveContext, callback) => {
					const fs = resolver.fileSystem;
					// 把 request.path 拆分成一段一段的，给各段拼接 node_modules，相当于查到到 / 下的 node_modules 目录
					// 比如 request.path = /users/rmb/Document/w5-proj，addrs 如下：
					// /users/rmb/Document/w5-proj/node_modules
					// /users/rmb/Document/node_modules
					// /users/rmb/node_modules
					// /users/node_modules
					// /node_modules
					const addrs = getPaths(request.path)
						.paths.map(p => {
							return this.directories.map(d => resolver.join(p, d));
						})
						.reduce((array, p) => {
							array.push.apply(array, p);
							return array;
						}, []);

					// 遍历 addrs 数组，期间通过 fs.stat 校验这些目录是否存在
					forEachBail(
						addrs,
						(addr, callback) => {
							// fs.stat 验证包管理目录存在与否
							fs.stat(addr, (err, stat) => {
								// 存在且是目录：
								if (!err && stat && stat.isDirectory()) {
									const obj = {
										...request,
										path: addr,
										request: "./" + request.request,
										module: false
									};
									const message = "looking for modules in " + addr;
									return resolver.doResolve(
										target,
										obj,
										message,
										resolveContext,
										callback
									);
								}
								// 目录不存在就是 missingDependencies 了
								if (resolveContext.log)
									resolveContext.log(
										addr + " doesn't exist or is not a directory"
									);
								if (resolveContext.missingDependencies)
									resolveContext.missingDependencies.add(addr);
								return callback();
							});
						},
						callback
					);
				}
			);
	}
};
