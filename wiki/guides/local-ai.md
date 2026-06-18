# 本地 AI 引用

`Copy local AI reference` 用于把当前对象的稳定定位信息交给本地 AI。

典型复制内容：

```text
ProofAtlas local reference
project: semi-discrete-stochastic-control
atlas_root: /path/to/Proof-Atlas/examples/semidiscrete/ProofAtlas
workspace_root: /path/to/Proof-Atlas/examples/semidiscrete
uid: obj_20260611_a7f3
name: main.claim.null_controllability
path: objects/main.claim.null_controllability/object.yml
body:
  - statement.md
```

如果项目配置了论文入口，还会出现：

```text
tex_main: main.tex
```

如果对象来自挂载的 Reference Atlas，还会出现 origin 和 citation 信息：

```text
origin: global_reference
origin_atlas: shared-reference-atlas
origin_atlas_root: /path/to/Proof-Atlas/examples/reference-atlas/ProofAtlas
citation_bibkey: Boyer2010
citation_trust: trusted
```

本地 AI 应把 `origin: global_reference` 视为外部引用对象；只读挂载不应直接改写，除非用户明确要求编辑对应 Reference Atlas。

## 定位规则

`uid` 是永久身份。路径和 `name` 可能在重命名后变化。

本地 AI 收到引用后，应优先用 `uid` 定位：

```bash
npm run atlas -- locate obj_20260611_a7f3 examples/semidiscrete
```

定位后按当前文件系统为准：

1. 读取定位结果中的 `object.yml`。
2. 读取 `body` 列出的 Markdown 文件。
3. 如果要理解字段和值，先读 [对象协议](../reference/object-protocol.md)。
4. 如果要生成或修改 Generated View / route，读 [Route 与导出](../reference/routes-and-export.md)。
5. 如果要改依赖关系，读 [边语义](../reference/edges.md)。

## 选区规则

如果引用包含 `selection`：

```text
selection:
  file: statement.md
  block: b003
  kind: paragraph
  excerpt: "For every h small enough..."
```

本地 AI 应用 `file + excerpt` 查找原文。`block` 是浏览器内部锚点，编辑后可能漂移。

## 为什么不复制全文

本地 AI 能直接读本地文件。复制短引用比复制完整正文更稳定，也更适合后续自动修改对象、依赖和状态。

## 本地 AI 操作清单

收到 `ProofAtlas local reference` 后，自动化工具应遵循：

1. 不要只相信 `path`。先用 `uid` 定位当前对象，因为对象可能被 rename。
2. 不要改 `uid`。需要改语义名时使用 `npm run atlas -- rename old.name new.name <project>`。
3. 修改 `object.yml` 字段时，只使用 wiki 中列出的枚举值。
4. 新增数学结论时通常从 `status: needs_check` 开始；人工核对后再改 `checked`。
5. 失败路线用 `status: disproved`，过时路线用 `status: obsolete`，不要写 `status: false`。
6. 新增 proof 时，在 proof 对象写 `edges.proves -> claim`，在 proof 上写证明依赖 `edges.uses`。
7. claim 的 statement 依赖写 `edges.requires`，不要把证明依赖直接写到 claim 的 `uses`。
8. 生成 route 时，`representation` 只能使用 `full`、`statement`、`summary`、`reference`、`omit`。
9. route 的 hard dependency 不得设为 `omit`；proof/meaning route 的 hard dependency 通常至少要 `statement`。
10. 修改后运行 `npm run atlas -- check --strict <paper-root-or-ProofAtlas-root>`。
