# Reference Atlas 与引用来源

Reference Atlas 是可复用的文献和外部结果库。普通论文项目只保存自己的数学对象；`source.*` 文献对象和从文献摘出的外部结果放在 Reference Atlas 里，再由论文项目挂载。

## 两类 atlas

普通论文项目默认是：

```yaml
schema_version: "0.1"
project: semi-discrete-stochastic-control
title: Semi-discrete stochastic controllability
default_view: views/dashboard.md
math_renderer: katex
atlas_type: project
```

Reference Atlas 写成：

```yaml
schema_version: "0.1"
project: shared-reference-atlas
title: Shared Reference Atlas
default_view: views/references.md
math_renderer: katex
atlas_type: reference
```

`atlas_type` 省略时默认为 `project`。普通项目不能定义本地 `source.*` 对象；`source.*` 命名空间保留给 Reference Atlas。Reference Atlas 可以定义 `source.paper_key`、`source.paper_key.claim.result` 这类对象。

## 挂载引用库

论文项目在可提交的 `atlas.yml` 里只声明结构性依赖：

```yaml
references:
  mounts:
    - id: shared-reference-atlas
      mode: readonly
```

`mode` 允许 `readonly` 或 `readwrite`，默认按只读使用。共享配置不要写本机绝对路径。

本机路径可以放在项目的 `ProofAtlas/.atlas/local.yml`：

```yaml
reference_atlases:
  shared-reference-atlas:
    root: ../reference-atlas/ProofAtlas
```

也可以放在用户级 registry：

```text
~/.proof-atlas/reference-atlases.yml
```

```yaml
reference_atlases:
  shared-reference-atlas:
    root: /path/to/reference-atlas/ProofAtlas
```

如果没有 registry，解析器还会从当前项目向上查找附近的 `reference-atlas/ProofAtlas`，并要求其中 `atlas.yml` 的 `project` 与挂载 id 匹配。

## Bib registry

Reference Atlas 用 `bib-registry.yml` 把 BibTeX 文件分成可信度组：

```yaml
schema_version: "0.1"
trusted:
  - id: main
    path: references.bib
unverified:
  - path: unverified.bib
rejected:
  - path: rejected.bib
```

每个 entry 可以是字符串路径，也可以是 `{ id, path }`。路径按 `bib-registry.yml` 所在 atlas root 解析；公开仓库里应使用相对路径，不要提交本机 PDF 路径或私人目录。

解析器会读取 BibTeX key，并把对象的 `citation.bibkey` 扩展成：

```text
bibkey
trust
bibfile
registryId
entryType
```

这些扩展字段是构图结果，不应手写进对象。

## source 对象

文献条目通常是 note：

```yaml
uid: obj_20260618_ref001
name: source.boyer_2010a
kind: note
role: literature
display_as: literature_note
title: Boyer 2010
provenance: external
citation:
  bibkey: Boyer2010
body:
  - note.md
```

从文献摘出的外部数学结果可以写成 `source.<paper>.claim.<name>`：

```yaml
uid: obj_20260618_ref101
name: source.boyer_2010a.claim.partial_discrete_lr
kind: math
role: claim
display_as: theorem
title: Partial discrete Lebeau-Robbiano estimate
provenance: external
citation:
  bibkey: Boyer2010
source_result:
  parent: source.boyer_2010a
  location: Theorem 2.1
  statement_fidelity: paraphrased
body:
  - statement.md
```

`source_result` 字段是可选说明：

| 字段 | 含义 |
|---|---|
| `parent` | 对应的文献 note 对象名。 |
| `location` | 结果在文献中的位置，例如 theorem、lemma、page 或 section。 |
| `statement_fidelity` | 语句忠实度，例如 `verbatim`、`paraphrased`、`adapted`。 |

## 校验规则

严格校验会检查：

- 挂载 id 重复或找不到路径。
- `atlas_type` 只能是 `project` 或 `reference`。
- 普通项目里出现本地 `source.*` 对象。
- `source.*` 对象缺少 `citation.bibkey`。
- `citation.bibkey` 不在已挂载 Bib registry 中。
- 同一个 BibTeX key 在不同 trust 组中冲突。
- 使用 `rejected` 引用来源。
- proof hard-uses `unverified` 外部结果时给 warning。
- proof hard-uses 外部 claim 时，该 claim 应能导出 statement。

缺少 Reference Atlas 挂载时，系统报告 `missing_reference_atlas_mount`，并避免继续把同一批 `source.*` 链接报成普通断链。

## UI 和导出

挂载对象会带有 `origin`：

```text
global_reference
origin_atlas: shared-reference-atlas
```

网页会在对象卡片和右栏显示 origin、bibkey、trust 和 `source_result` 的 fidelity。`Copy local AI reference` 和 route export 也会包含 origin/citation 元数据，方便本地 AI 区分“当前论文对象”和“外部引用对象”。
