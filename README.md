# IHO E2E

用于 Vue 3 IHO 项目的非浏览器行为测试工具箱：从零安装测试环境、检查项目接入、读取可追溯公共规则，并提供日常 AI 开发使用的两个 skill。

项目测试仍使用 Vitest、happy-dom、Vue Testing Library、user-event 和 MSW，保留真实页面及内部业务逻辑。此处的流程测试不验证真实浏览器布局、后端部署或物理设备。

## 让 AI 帮你初始化

把 [AI_SETUP.md](AI_SETUP.md) 文件或链接交给能访问项目、执行命令的 AI，然后告诉它：

> 请按这份文档为当前项目初始化行为测试环境。你能检查和处理的事情直接完成，缺少必要信息时在会话中问我，最后运行验证并告诉我以后如何使用。

无需预先克隆工具包或安装 skill。AI 会定位项目、准备工具、安装依赖、适配现有配置并实际验证；只有项目位置、访问权限等必要信息无法自行确定时才询问。文档可单独下载或作为附件转交。

## 从零接入

要求：已有 Vue 3 应用的 package.json；Node 满足所选 Vitest/Vite 及传递依赖的 engines；可用的 npm、Yarn 或 pnpm。当前建议 Node 24.15 以上的 24 LTS，已在本机 Node 24.22.1 用于 Yarn 项目依赖安装。工具不安装系统 Node，也不会把 Vue 2 应用迁移成 Vue 3。

```sh
git clone https://github.com/cnhis-frontend/iho-e2e.git
cd iho-e2e
node bin/iho-test.mjs init --project /absolute/path/to/iho-project
node bin/iho-test.mjs init --project /absolute/path/to/iho-project --apply
```

第一次命令只预览；第二次会：

1. 根据 packageManager/锁文件选择包管理器；存在冲突时报告，不生成第二套锁文件。
2. 安装缺失的 Vitest、happy-dom、Vue SFC/JSX 测试工具、MSW 和类型检查依赖。已声明的版本保留，以实际验证判断兼容性。
3. 创建独立测试配置、HTTP/setup、测试 tsconfig、运行命令和固定公共规则快照。
4. 运行环境冒烟与测试类型检查；失败则明确报告初始化未完成。

重复执行会保留定制文件和已有脚本。`--no-install` 或 `--no-verify` 适合受限环境，但对应状态仍为未完成。工具不启用插件，也不访问真实业务 API。

默认使用项目已有包源。镜像缺少所选版本时，可显式传入 `--registry https://registry.npmjs.org`；此参数只用于本次安装，不改项目 npmrc。私有依赖仍应遵循项目的 registry 配置。安装日志会保留 Node engines 和包源错误，初始化不会忽略它们后宣称成功。

环境冒烟包含真实 Vue SFC 表单操作与 MSW 请求往返，位于 `tests/iho-env`。**它不算业务流程覆盖。** 接下来按 [项目适配说明](docs/project-adaptation.md) 接入真实页面，完成 `tests/flows` 用例，再运行：

```sh
node bin/iho-test.mjs doctor --project /absolute/path/to/iho-project --run
```

已有环境可在 `iho-test.config.json` 映射现有 scripts、flowConfig、flowDirectory 和 documentation。初始化识别到该 profile 指向既有测试配置时，会复用映射的命令并补缺失依赖，不再生成另一套 starter。`doctor` 默认静态检查，`--run` 才运行流程与类型检查；空用例或跳过用例不会被判定为通过。

## AI 开发接入

```sh
node scripts/install-skills.mjs --project /absolute/path/to/iho-project
```

仅安装到指定 Vue 3 IHO 项目的 `.agents/skills/`，不安装到个人或全局目录。必须传入 `--project`；旧的 `--to` 参数不再支持。安装的是可提交的普通文件，两个 skill 目录应一起纳入 Git。

`iho-test-bootstrap/toolkit/` 附带两个 skill 共用的 CLI、规则和适配文档快照；拉取项目后即可使用，不依赖安装者的目录或单独的工具包 checkout。快照不包含 node_modules、凭据或个人配置，依赖安装仍由初始化流程完成。目录内 `.gitattributes` 固定 LF，保证 Git 克隆后规则摘要不变。

重复安装按清单校验已安装文件，未改动的快照可以更新；发现项目内修改或同名自有文件时保留并报告冲突，先审查合并再更新。此前指向本工具包的项目链接会迁移为普通文件，并删除安装器旧有的两条 skill 忽略项；其他忽略规则保持不变。项目通过 AGENTS.md 和测试说明记录使用入口。

- `iho-test-bootstrap`：创建、迁移、修复测试环境，直至真实流程通过。
- `iho-behavior-testing`：从需求或缺陷编写行为测试，复用项目环境；与 mattpocock TDD 的开发节奏配合。

在项目 AGENTS.md 中用短规则链接项目测试说明，并要求业务变更应用行为测试技能。工具环境与项目指令应提供事实依据，不能把技能加载等同于业务已经验证。

## 可插拔知识来源

公共规则保存在 `knowledge/catalog.json` 和对应文档中；项目初始化时得到带 SHA-256 的离线快照。规则正文与执行 skill 分离。

```sh
node bin/iho-test.mjs rules --project /absolute/path/to/iho-project
node bin/iho-test.mjs rules --project /absolute/path/to/iho-project --id iho.behavior-testing
```

支持本地目录、固定 Git commit 和 OpenViking 提供方。Git 提供方读取指定提交中的文件，忽略未提交内容；当前 checkout HEAD 必须匹配配置。OpenViking 读取同样的规则 catalog，通过 GET `/api/v1/content/read` 获取全文，校验摘要；不写记忆、不启用插件。检索是清单关键词筛选，不是语义检索。

配置示例参见 [知识提供方](docs/knowledge-providers.md)。OpenViking 已通过离线协议测试和一次获授权的真实服务联调，范围与证据见 [联调记录](docs/openviking-live-validation.md)；其他部署仍需验证接口与规则内容，连接或启用插件遵循用户授权。

## 验证工具箱

```sh
npm test
npm run test:bootstrap
```

工具箱本身无第三方运行依赖。`test:bootstrap` 会创建隔离的 work/ 项目并真实下载安装测试依赖，验证从零搭建、幂等性、空套件与漏声明请求检测、实际 DOM 用例及类型检查。发布到 npm 尚未配置，当前通过源码 checkout 使用。

实际接入情况见 [首批项目结果](docs/project-results.md)，命令与验证边界见 [验证记录](docs/validation.md)。
