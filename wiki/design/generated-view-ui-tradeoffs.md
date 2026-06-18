# Generated View UI 取舍

Proof Atlas v1 把本地文件视为事实源。对象、边、route 文件和导出结果通过 CLI、
本地 AI 或文件编辑器创建和修改。Web UI 是只读浏览层，用来查看 view、对象、
resolver 输出、诊断信息和稳定的本地引用。

## 当前选择

Generated View 从已有的 `views/*.route.yml` 文件打开：

```text
.route.yml
    -> Resolver
    -> Resolved dependency slice
       -> Graph projection
       -> Linear projection
```

图是 route resolver 的输出，不是浏览器创建或保存 route 的输入。

Web UI 不应提供这些写入能力：

- 选择 proof 分支；
- 切换依赖是否纳入；
- 编辑 `boundary`；
- 拖拽节点并保存排序；
- 写入 `.route.yml`；
- 导出并写入文件。

它可以提供只读复制操作：

- `Copy command to create route`;
- `Copy local AI request`;
- `Copy local AI reference`;
- `Copy export command`.

## 原因

这样可以让产品边界保持简单：

- 文件仍然是事实源；
- 修改可以在 git 中审计；
- 本地 AI 和 CLI 可以用明确 diff 执行结构化修改；
- 浏览器保持稳定，专注阅读、跳转、渐进披露、诊断和复制引用。

这也符合当前的上下文目标。云端 AI 通常可以接受比较长的上下文，因此 v1
优先保证内容充分和可追溯，而不是激进压缩 token。

## 延后方案

交互式组织仍然有价值。后续版本可以允许浏览器侧临时覆盖 representation mode、
boundary choice 或 proof choice，并实时显示 token 估算。

即便如此，未来 UI 也应避免直接写文件。它应该生成带有临时 override 的命令或请求。
当前 CLI 已支持通过 `npm run atlas -- route` 保存 representation 和 boundary，例如：

```bash
npm run atlas -- route main.claim.null_controllability \
  examples/semidiscrete/ProofAtlas \
  --profile proof \
  --representation main.setting.discrete_mesh=statement \
  --boundary source.boyer_2010a.claim.partial_discrete_lr \
  --save views/null_controllability.route.yml
```

之后由用户、CLI 或本地 AI 决定是否把这些修改物化到 route 文件中。
