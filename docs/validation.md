# 验证记录

日期：2026-10-23。

## 工具箱

- `npm test`：14 项通过，覆盖知识来源一致性、版本变化、不可用/权限拒绝、固定 Git 提交、初始化幂等、定制配置保留、包管理器选择、Node/Vue 前置条件、TypeScript 别名继承、既有 profile 避免生成并行环境，以及子命令沿用工具的 Node 运行时。
- `npm run test:bootstrap`：通过。从仅声明 Vue 3.5.13 的隔离项目开始，真实安装测试依赖，Vue SFC 表单/DOM/MSW 环境冒烟及类型检查通过。
- 同一自动验证确认：重复初始化计划不产生变更；空业务套件失败；被业务 catch 的漏声明网络请求仍失败；实际 DOM 交互用例被 doctor 正确接受。
- skill-creator 的 quick_validate：两个 skill 均通过。Windows junction 安装、重复安装及经链接运行 CLI 均验证通过。
- 安装基线最初在 Node 22.14.0 + npm 上通过，但传递依赖给出更高 Node 要求的警告；最终从零安装及完整验证又在 Node 24.22.1 上通过。OTC 的 Yarn 接入同样使用 Node 24.22.1。Windows 启动器保留 npm 已升级的全局 CLI，并使用当前 Node 启动它，避免旧 npm.cmd 偷换运行时。新环境推荐满足完整依赖树 engines 的 Node 24 LTS。

上述隔离项目用于验证工具行为，不计入业务项目覆盖。自动验证工作目录和完整输出保存在本地被忽略的 work/ 中，可通过脚本重新生成。

## 项目接入状态

| 项目 | 当前证据 | 完整验收 |
| --- | --- | --- |
| iho-expense-ui | 5 条流程及乱序运行通过；测试类型检查、doctor、165 条相关回归通过；3 种业务故障检测有效 | 已完成 |
| iho-otc-ui | 13 条流程、1 条环境冒烟、测试类型检查、code:check、35 条相关回归通过；分页故障检测有效且恢复 | 已完成 |
| iho-miias-ui | 5 条流程、测试类型检查、doctor、code:check、43 条相关回归通过；分类类型故障检测有效 | 已完成 |

共 23 条真实业务流程通过。业务项目改造保留在各自工作区，未提交/推送；没有批量删除旧测试。Expense 旧 MedicalViewButtonGroup 套件有 28 条基线失败（原始配置同样复现），未把全量旧套件标记为通过。

最终回执位于各本地仓库的 `.scratch/behavior-testing-phase-a/handoff.md`（expense）或 `.scratch/behavior-testing-rollout/handoff.md`（otc/miias）。这些过程文件被各仓库忽略，团队可提交的操作说明在项目 docs 中。规则固定为 d0deae3 的快照，诊断器可使用后续已验证版本；规则版本与工具版本分别记录。

MIIAS 流程测试复现并修复了两项取消处理问题：根分类创建明确处理 DialogCancelError；输入确认框仅在验证成功后标记确认，避免验证失败后关闭仍被视为确认。Expense 为真实单据选择补可访问名称，并提供独立 UI 容器释放；OTC 提供独立 Pinia 安装和 UI 容器释放。所有项目保留业务页面、状态及实际请求链路。

## 未进行的验证

OpenViking 仅完成注入 HTTP 响应的离线协议测试，未连接用户服务。三个项目的 OpenViking 插件保持禁用，重新开启须先与用户沟通。非浏览器测试不验证真实浏览器布局、真实后端或设备。
