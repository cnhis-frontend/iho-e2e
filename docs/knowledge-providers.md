# 知识提供方配置

项目 `iho-test.config.json` 的 `knowledge` 字段选择来源。`catalogSha256` 固定 catalog 内容，catalog 内每条规则再固定文档内容。修改正式规则时更新对应摘要并审查版本变更；不要用自动重算掩盖意外漂移。

本地快照：

```json
{"type":"local","root":"tests/knowledge","catalog":"catalog.json","catalogSha256":"已审查的 catalog SHA-256"}
```

Git checkout：

```json
{"type":"git","root":"../rules-repo/knowledge","commit":"完整提交SHA","catalog":"catalog.json","catalogSha256":"已审查的 catalog SHA-256"}
```

OpenViking（仅在用户授权连接后配置）：

```json
{"type":"openviking","baseUrl":"https://your-knowledge-service/","rootUri":"viking://resources/your-rules","catalog":"catalog.json","tokenEnv":"IHO_KNOWLEDGE_TOKEN","catalogSha256":"已审查的 catalog SHA-256"}
```

catalog 与 Markdown 文档需已经存在于指定资源目录；本工具不自动上传。token 从环境变量读取，不写入项目配置。baseUrl 可包含网关路径前缀；使用 Bearer 认证，拒绝重定向。无需依赖 Codex OpenViking memory 插件。

提供方统一返回规则元数据、正文、来源和内容摘要。默认检索只返回 accepted 规则，draft/memory 必须明确指定，且不能据此自动升级为强制规范。状态错误区分 NOT_FOUND、UNAVAILABLE、ACCESS_DENIED、VERSION_MISMATCH 和 INVALID；服务故障不返回空的成功结果。

接口依据：OpenViking 本地源码提交 `97c0ceb7720c7d14e988a6d322f020c0024e800b` 的 `docs/en/api/12-content.md` 与 `01-overview.md`。自动测试通过注入 fetch 响应验证协议；2026-10-23 已在用户授权的云服务上通过真实规则读取、摘要校验、CLI 与错误分支验证，见 [联调记录](openviking-live-validation.md)。该结果仅证明此次部署的接口兼容性，新部署仍需核对契约。

接入其他知识库时，实现与 createKnowledge 相同的 search/read/provenance 接口，并对来源、内容变化及不可用情况加入行为测试。测试运行代码本身不调用此接口。
