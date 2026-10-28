# OpenViking 联调范围与复验方法

适配器曾于 2026-10-23 在获授权的真实服务上完成以下验证。此记录保留协议证据和复验方法；服务地址、资源目录、凭据及部署版本由使用方记录在自己的环境中。

## 已验证的行为

| 检查 | 结果 |
| --- | --- |
| Bearer 认证、网关路径前缀和中文文档路径 | HTTP 200，响应包含原文字符串 |
| catalog 与规则正文回读 | SHA-256 与已固定的本地快照一致 |
| 实际 createKnowledge 及 CLI 读取规则 | 成功，正文与本地提供方一致 |
| accepted 规则关键词筛选及项目过滤 | 与本地提供方结果一致 |
| 配置错误 catalog 摘要 | VERSION_MISMATCH |
| 不存在的远端 catalog | 服务 HTTP 404，适配器 NOT_FOUND |
| 不携带认证凭据 | 服务 HTTP 401，适配器 ACCESS_DENIED |
| 不存在的规则 ID | NOT_FOUND |
| 将 Markdown 正文当成 catalog | INVALID |

验证使用标准 content/read 接口，查询参数 `raw=true`。无需启用 memory 插件。自动协议测试使用注入响应，真实验证的结果只适用于被验证的服务契约。

## 在其他部署复验

1. 根据 [知识提供方配置](knowledge-providers.md) 设置 baseUrl、rootUri、catalog、tokenEnv 和已确认的摘要。占位示例 rootUri 为 `viking://resources/example-rules`。
2. 确认用户已授权连接。凭据由本机环境变量提供，不写入项目或报告。
3. 准备已存在的 catalog 与正文。若需要新增资源，先明确目标及写入范围；初始化工具不自动上传。
4. 运行实际 CLI，并将来源、正文及摘要与已固定规则比较：

```sh
node bin/iho-test.mjs rules --project "<项目路径>" --query "<关键词>"
node bin/iho-test.mjs rules --project "<项目路径>" --id "<规则ID>"
```

5. 在独立验证配置中使用错误摘要、缺失资源路径及不携带凭据的请求，确认错误被正确区分；验证结果仅在用户会话中报告。

## 未验证的能力

上述检索是 catalog 关键词筛选，不是语义搜索。规则原文读取成功不代表异步语义或向量索引处理已完成。远端正文篡改拒绝由离线协议测试覆盖，真实验证只比较正常原文及固定摘要。

服务或规则配置变化后重新验证；测试执行本身继续独立于在线知识服务和模型运行。
