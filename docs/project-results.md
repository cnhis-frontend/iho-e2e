# 首批 IHO 项目接入结果

验收日期：2026-10-23。三个项目使用同一份固定本地公共规则，业务 fixtures 与挂载适配由各仓库维护。

| 项目 | 项目命令 | 覆盖结果 | 可提交说明 |
| --- | --- | --- | --- |
| iho-expense-ui | `yarn test:behavior` / `yarn typecheck:behavior` | 5 条；现金限定待结单据、自费锁定、混选拦截、真实收银台；相关旧回归165条 | `docs/agents/testing.md` |
| iho-otc-ui | `yarn test:flows` / `yarn test:types` | 13 条；强通成功、失败重试、取消、权限、无效选择、当前页刷新；相关旧回归35条 | `docs/agents/testing.md` |
| iho-miias-ui | `yarn test:flows` / `yarn test:types` | 5 条；创建分类、失败重试、取消、校验后关闭、异常分类只读；相关旧回归43条 | `docs/testing/behavior-testing.md` |

OTC/MIIAS 各有独立 `test:env` 冒烟命令；Expense 的首批真实流程直接验证其环境。三个项目的 profile 将实际命令映射给统一 doctor，无需强制相同目录名称。

复用环境时从 [项目适配](project-adaptation.md) 和各项目现有测试开始。不要把费用单据、机构分类或账单强通的业务判断搬进工具箱；公共规则约束测试方法，业务预期来自各项目 spec/ADR。

这是首批流程接入，不是全系统场景迁移。旧测试均保留，后续按需求和缺陷逐步增加行为覆盖，并以规则映射替换重复旧测试。Expense 的旧 MedicalViewButtonGroup 基线失败仍需单独处理；本次没有声称全部历史测试全绿。
