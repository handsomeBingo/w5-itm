const { operands, options } = this.program.parseOptions(process.argv);

if (operands === helpSyntax) {
  // 注册 help 命令
} else if (operands === versionSyntax) {
  // 注册 version 命令
} else if (operands === buildSyntax) {
  // 注册 build/watch 命令
}
