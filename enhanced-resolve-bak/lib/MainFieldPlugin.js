/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/

"use strict";

const path = require("path");
const DescriptionFileUtils = require("./DescriptionFileUtils");

/** @typedef {import("./Resolver")} Resolver */
/** @typedef {import("./Resolver").ResolveStepHook} ResolveStepHook */
/** @typedef {{name: string|Array<string>, forceRelative: boolean}} MainFieldOptions */

const alreadyTriedMainField = Symbol("alreadyTriedMainField");

module.exports = class MainFieldPlugin {
	/**
	 * @param {string | ResolveStepHook} source source
	 * @param {MainFieldOptions} options options
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
		resolver
			.getHook(this.source)
			.tapAsync("MainFieldPlugin", (request, resolveContext, callback) => {
				if (
					request.path !== request.descriptionFileRoot ||
					request[alreadyTriedMainField] === request.descriptionFilePath ||
					!request.descriptionFilePath
				)
					return callback();

				// package.json
				const filename = path.basename(request.descriptionFilePath);

				// package.json.main 字段值
				let mainModule = DescriptionFileUtils.getField(
					request.descriptionFileData,
					this.options.name
				);

				if (
					!mainModule ||
					typeof mainModule !== "string" ||
					mainModule === "." ||
					mainModule === "./"
				) {
					// 不处理
					return callback();
				}
				if (this.options.forceRelative && !/^\.\.?\//.test(mainModule))
					mainModule = "./" + mainModule;
				const obj = {
					...request,
					request: mainModule, // 重写 request 为 包名/主入口模块
					module: false,
					directory: mainModule.endsWith("/"), // 是否为目录
					[alreadyTriedMainField]: request.descriptionFilePath
				};
				return resolver.doResolve(
					target,
					obj,
					"use " +
						mainModule +
						" from " +
						this.options.name +
						" in " +
						filename,
					resolveContext,
					callback
				);
			});
	}
};
