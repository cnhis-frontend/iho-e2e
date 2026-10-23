# 三项目共享环境基线 v1

冻结时间：2026-10-23。范围是测试依赖、HTTP 隔离和项目适配协议，不是整份 expense 页面实现的最终验收。

## 已有证据

- expense 阶段 A 检查点：2026-10-23 14:54:39，真实 App/SettleIndex/SettleContent 的 2 tests / 1 file 通过，包含默认自费锁定、混入可医保待结单据及混合选择的结账拦截。证据来源为 expense `.scratch/behavior-testing-phase-a/checkpoint.md`。完整分支、独立测试类型检查和故障验证当时仍在进行；不能标记 A 全部完成。
- 工具包干净 Vue 3.5.13 项目：从零安装缺失依赖，真实 SFC 表单输入→MSW HTTP→可见保存结果的环境测试通过，vue-tsc 独立测试类型检查通过。2026-10-23 14:57 再次验证更新后的严格 HTTP setup 通过。
- 工具包知识/初始化行为测试 9 项通过。空流程套件由 doctor 拒绝；业务捕获未声明请求异常后，afterEach 仍让用例失败。

## 兼容版本

两处均使用 Vue 3.5.13、Vite 8.3.4、Vitest 5.0.0、happy-dom 20.10.6、MSW 2.15.0、Vue Testing Library 8.1.0、user-event 14.6.8、jest-dom 7.0.1、DOM Testing Library 10.x。保留项目现有兼容版本，实际解析版本记录在各项目锁文件与回执中。新项目默认版本见 `lib/bootstrap.mjs`。

## 共同接口

1. 真实 DOM 驱动页面。真实 providers、Pinia、router、业务子组件与 HTTP 客户端保持在链路内。
2. MSW 在网络接口提供精确场景响应。onUnhandledRequest 先记账再 print.error，每例清理时断言未声明请求为零，以捕获业务 catch 吞掉的异常。handlers 每例 reset，server 在套件结束 close。
3. 每个项目自行实现 render/cleanup，复用生产初始化。真实离散弹窗 API 必须能释放；可以添加最小 dispose 接口并验证生产无回归。
4. 保留已有 Vue/TSX/自动组件解析/样式隔离配置，测试配置范围明确包含新目录。happy-dom 可关闭 CSS/JS 文件资源下载，但不得关闭实际 HTTP 业务请求。
5. 组件库导入未使用的外部音视频 SDK 时，可以在该设备接口提供调用即失败的替身。禁止换成内部业务 hooks 或整张业务表格的模拟。
6. 宿主编排、外部设备与 HTTP 为测试替换接口。页面公共 DOM、HTTP 契约及宿主出口是本次 rollout 已采用的测试接口。
7. project profile 映射本项目真实脚本、flowConfig、flowDirectory 和项目测试说明；目录可以是 tests/behavior 或 tests/flows，不强制重命名。
8. 测试文件有独立类型检查；编译通过、环境冒烟通过和真实业务流程通过分别报告。

## C1 / C2 执行

读取共享 skill `skills/iho-behavior-testing/SKILL.md`；已有环境迁移时也阅读 bootstrap skill。先预览 CLI init 了解依赖与通用配置；选择适合既有项目的增量适配，保留其样式插件版本。不要机械引入一份新的并行环境。

公共规则采用此仓库 `knowledge/catalog.json` 与 `behavior-testing.md` 的固定快照。把它们复制到项目 `tests/knowledge`，在项目 profile 记录 catalog SHA-256。无在线知识读取、OpenViking 插件保持关闭。业务预期仍以项目 spec/ADR 为准。

OTC 试点采用调查回执中的“账单打包强通”；MIIAS 采用“本地规则管理新增机构自定义根分类”。各自先成功路径，再失败/取消/权限的关键分支。只交付本项目适配，不修改共享仓库。对实际业务缺陷或泄漏的最小修复需要回归证据，不以全局吞掉错误处理。

完成后形成第 9 节交接回执，并给出真实命令和结果；不以静态调查完成代替实施完成。首次接入保留未映射的旧测试，避免无证据批量删除。
