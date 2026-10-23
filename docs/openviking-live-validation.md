# OpenViking 真实服务联调

验收时间：2026-10-23 17:00（Asia/Shanghai）。结论：现有 OpenViking 适配器在本次授权部署上通过验收，无需修改运行时代码。

## 范围与准备

用户先授权只读联调。服务连接和已有文档读取成功，但在可见的 engineering、projects 资源目录未找到工具包 catalog。用户随后明确授权在新目录新增 `catalog.json` 与 `behavior-testing.md`，用于完成验收。

- 目标：`viking://resources/iho-behavior-testing-v1`。
- 使用 toolkit `knowledge/` 中已确认的版本 1 公共规则，上传前核实目标文件不存在，上传后读取原文校验摘要。
- 认证复用本机既有凭据，只在验证进程环境中注入 `IHO_KNOWLEDGE_TOKEN`；没有把凭据写入项目、日志或报告。
- 使用部署已有的网关路径前缀及 Bearer 认证。部署的服务端构建版本未独立确认，源码参考版本不等同于部署版本。

## 通过的验证

| 检查 | 实际结果 |
| --- | --- |
| 认证与已有中文路径文档读取 | HTTP 200，`status: ok`，`result` 为原文字符串 |
| 两份新增规则文件写入与回读 | HTTP 200；远端内容与本地 SHA-256 一致 |
| 实际 `createKnowledge` 加载远端 catalog、读取规则 | 成功；正文与本地提供方完全一致 |
| accepted 规则关键词筛选及项目过滤 | 与本地提供方结果一致 |
| 实际 CLI `rules --query 行为` | 退出码 0，来源为 `openviking` |
| 实际 CLI `rules --id iho.behavior-testing` | 退出码 0，正文与本地一致 |
| 故意配置错误 catalog 摘要 | `VERSION_MISMATCH`；未修改远端内容 |
| 请求不存在的 catalog | 服务 HTTP 404，适配器 `NOT_FOUND` |
| 不携带凭据读取 | 服务 HTTP 401，适配器 `ACCESS_DENIED` |
| 读取不存在的规则 ID | `NOT_FOUND` |
| 将已有 Markdown 当成 catalog 读取 | `INVALID`，没有将无效清单当成成功 |

固定摘要：

```text
catalog.json
fa08418ae414688d9961b3f770f125498949a3c4766f36114f1481218b616b79

behavior-testing.md
01ba6b57c23363f79db7975d37f777c95d448269fd4cf716c0a482ad68e7e09c
```

## 目录调整复验

2026-10-23 17:04（Asia/Shanghai）按用户要求，将规则目录移至 resources 根目录下的上述目标。移动前确认目标不存在；移动后实际适配器读取与关键词筛选通过，catalog 和正文摘要均未改变，原 engineering 下的目录返回 HTTP 404。

## 使用与边界

可按 [知识提供方配置](knowledge-providers.md) 配置服务地址、上述 rootUri、catalog 和摘要，然后在有授权的环境中执行：

```sh
node bin/iho-test.mjs rules --project "<项目路径>" --query 行为
node bin/iho-test.mjs rules --project "<项目路径>" --id iho.behavior-testing
```

本次 CLI 使用独立验证目录，三个业务项目的知识来源保持本地快照，memory 插件保持禁用。验证不依赖该插件。

关键词检索是读取 catalog 后的本地筛选，不是 OpenViking 语义搜索。上传接口返回语义与向量处理已排队；本次验收针对原文读取，不代表后台索引已处理完成。未上传损坏正文来测试远端内容篡改，正文变更拒绝仍由现有离线自动测试覆盖；本次真实验证确认两份远端内容与已固定摘要一致。

换服务地址、规则版本或认证配置后需重新验证。实际业务测试仍独立于在线知识服务和模型运行。
