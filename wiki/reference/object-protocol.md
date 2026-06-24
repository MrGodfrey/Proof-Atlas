# 对象协议

每个对象由 `object.yml` 和一个或多个 Markdown body 文件组成。

最小形式：

```yaml
uid: obj_20260611_a7f3
name: main.claim.null_controllability
kind: math
role: claim
title: "Main theorem: phi-null controllability with drift control"
body:
  - statement.md
```

推荐完整形式：

```yaml
uid: obj_20260611_a7f3
name: main.claim.null_controllability
kind: math
role: claim
display_as: theorem
importance: main
status: needs_check
title: "Main theorem: phi-null controllability with drift control"
summary: Main theorem asserting low-mode null control, a uniform drift-control bound, and exponentially small final residual.
body:
  - statement.md
edges:
  requires:
    - target: main.model.forward_semidiscrete_system
      reason: The theorem statement refers to the controlled system.
  cites:
    - target: source.lue_2011
citation:
  bibkey: Lue2011
```

## 代码事实源

本页描述的是当前代码实现，不是理想化 schema。枚举值的代码事实源是：

- `src/core/types.ts`：`KINDS`、`MATH_ROLES`、`ISSUE_ROLES`、`NOTE_ROLES`、`DISPLAY_AS`、`IMPORTANCE`、`STATUS`、`PRIORITY`、`PROVENANCE`、`EDGE_TYPES`、`EDGE_STRENGTHS`。
- `src/core/constants.ts`：默认 `display_as`、默认 `status`、默认 body 文件名和状态颜色。
- `src/core/graph.ts`：YAML 归一化、校验、warning 规则和 route 文件 schema 校验。

机器写对象时应以本页和上述代码枚举为准。不要发明相近字段或相近枚举值，例如不要写 `status: false`、`representation: full_statement`、`edge: depends_on`。

## 字段总览

| 字段 | 必填 | 默认值 | 作用 |
|---|---:|---|---|
| `uid` | 是 | 无效 fallback 仅用于继续构图 | 永久机器身份。 |
| `name` | 是 | 无效 fallback 仅用于继续构图 | 人类可读语义名，也是链接名。 |
| `kind` | 是 | `math` | 大类：数学对象、问题对象或笔记对象。 |
| `role` | 是 | 按 `kind` fallback | 对象在图中的语义角色。 |
| `title` | 是 | `name` fallback | 页面标题和导出标题。 |
| `body` | 是 | 无 | 一个或多个同目录 Markdown 文件。 |
| `display_as` | 否 | 由 `kind + role` 推导 | 视觉展示类型，不改变语义身份。 |
| `importance` | 否 | `supporting` | 路线排序和人工阅读优先级。 |
| `status` | 否 | `issue` 默认为 `open`，其他默认为 `draft` | 当前可信度、生命周期或问题状态。 |
| `summary` | 否 | 无 | route `summary` 表示和列表摘要使用的短说明。 |
| `priority` | issue 推荐 | issue 默认为 `normal` | issue 的处理优先级。 |
| `provenance` | 否 | `internal` | 信任边界：内部、外部或导入。 |
| `tags` | 否 | `[]` | 自由标签，当前主要供搜索和人工整理。 |
| `edges` | 否 | `{}` | 正向关系边。 |
| `citation` | source 对象必填 | 无 | BibTeX key；trust 由 Bib registry 派生。 |
| `source_result` | 否 | 无 | 外部结果在来源文献中的父条目、位置和语句忠实度。 |

## `uid`

机器身份，创建后不应改变。

格式：

```text
obj_[0-9]{8}_[a-z0-9]{4,8}
```

不要手写语义化 uid，例如 `obj_main_theorem`。

## `name`

人类可读的语义引用名，Markdown 链接和 view 嵌入使用它。

推荐格式：

```text
[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+
```

例子：

```text
main.claim.null_controllability
main.proof.lr_iteration
main.issue.adaptedness
source.boyer_2010a
```

如果要改名，使用 `npm run atlas -- rename`，不要只手改 `object.yml`。

## `kind`

允许值：

```text
math
issue
note
```

含义：

- `math`：数学内容，包括问题、设定、模型、定义、结论、证明、构造、计算、例子、反例。
- `issue`：当前研究中的问题、缺口、风险或待检查处。
- `note`：非核心数学对象，包括文献笔记、AI 讨论、历史说明、审稿意见、外部上下文。

## `role`

`math` role：

```text
problem
setting
notation
definition
model
assumption
claim
proof
proof_fragment
construction
calculation
example
counterexample
```

`issue` role：

```text
gap
question
todo
risk
possible_error
review_concern
missing_reference
```

`note` role：

```text
literature
ai_note
meeting
review_note
historical
scratch
external_context
```

推荐用法：

- 定理、引理、命题、推论、重要估计：`kind: math`, `role: claim`。
- 完整证明：`kind: math`, `role: proof`。
- 局部证明片段或失败路线：`kind: math`, `role: proof_fragment`。
- 常数估计、代数整理：`kind: math`, `role: calculation`。
- 构造控制、时间网格、截断函数：`kind: math`, `role: construction`。

## `display_as`

控制网页展示样式，不改变对象身份，也不改变 route resolver 的核心逻辑。`role` 说明“它是什么”，`display_as` 说明“它在页面上以什么形式呈现”。

允许值：

```text
plain
problem
setting
notation
definition
assumption
equation
theorem
lemma
proposition
corollary
conjecture
proof
proof_fragment
estimate
construction
calculation
example
counterexample
remark
issue
gap
question
todo
warning
note
literature_note
ai_note
review_note
meeting_note
```

默认映射由代码推导：

| `kind` / `role` | 默认 `display_as` |
|---|---|
| `math.problem` | `problem` |
| `math.setting` | `setting` |
| `math.notation` | `notation` |
| `math.definition` | `definition` |
| `math.model` | `plain` |
| `math.assumption` | `assumption` |
| `math.claim` | `theorem` |
| `math.proof` | `proof` |
| `math.proof_fragment` | `proof_fragment` |
| `math.construction` | `construction` |
| `math.calculation` | `calculation` |
| `math.example` | `example` |
| `math.counterexample` | `counterexample` |
| `issue.gap` | `gap` |
| `issue.question` | `question` |
| `issue.todo` | `todo` |
| `issue.risk` / `possible_error` / `review_concern` / `missing_reference` | `warning` |
| `note.literature` | `literature_note` |
| `note.ai_note` | `ai_note` |
| `note.meeting` | `meeting_note` |
| `note.review_note` | `review_note` |
| `note.historical` / `scratch` / `external_context` | `note` |

什么时候改写 `display_as`：

| 场景 | 推荐写法 | 原因 |
|---|---|---|
| 一个 `role: claim` 实际是主定理 | `display_as: theorem` | 让页面和导出标题符合数学读者预期。 |
| 一个 `role: claim` 是引理 | `display_as: lemma` | 仍然是 claim，route 可为它找 proof，但页面显示为 lemma。 |
| 一个 `role: claim` 是关键估计 | `display_as: estimate` | route resolver 不把 `estimate` 当成 obligation claim，因此不会自动为它找 proof；适合把公式型估计作为依赖材料。 |
| 一个 `role: claim` 是等式或恒等式 | `display_as: equation` | 与 `estimate` 类似，强调它是可引用公式，不是需要单独证明路线的主 obligation。 |
| 一个 `role: model` 只是普通模型描述 | 省略或 `display_as: plain` | 避免页面上把模型误读成 theorem/definition。 |
| 文献对象 | `kind: note`, `role: literature`, `display_as: literature_note` | 让右栏和导出把它视为来源材料。 |

注意：proof obligation 的代码判据是 `kind: math`、`role: claim`，并且 `display_as` 不是 `equation` 或 `estimate`。因此 `plain`、`theorem`、`lemma`、`proposition`、`corollary`、`conjecture` claim 都可以作为 Proof Tree root；`display_as: equation` 或 `display_as: estimate` 只能作为引用材料或 context，不会作为 Generated View 根节点。

## `importance`

允许值：

```text
main
supporting
background
local
```

含义：

- `main`：主问题、主结论、主证明路线或主要阻塞点。
- `supporting`：证明主线所需的重要辅助对象。
- `background`：设定、定义、文献背景、标准工具。
- `local`：只服务于局部论证或临时讨论的对象。

## `status`

允许值：

```text
draft
partial
needs_check
checked
open
resolved
disproved
obsolete
archived
```

推荐含义和使用例子：

| status | 含义 | 典型对象 | 例子 |
|---|---|---|---|
| `draft` | 刚写下，结构和内容都可能改。 | 新 claim、新 proof、新 note。 | 刚从论文草稿切出来的 lemma，还没有补全依赖边。 |
| `partial` | 有实质内容，但明确未完成。 | 未完证明、只写了一半的构造。 | proof 文件已有前半段，但最后一步还没写。 |
| `needs_check` | 看起来可用，但还需要复核。 | 新录入的 theorem、estimate、proof。 | AI 根据论文切出的主定理，应先标 `needs_check`。 |
| `checked` | 已复核，当前认为可靠。 | 已人工核对的设定、定理、证明、文献条目。 | 与原 LaTeX 对照过的 observability estimate。 |
| `open` | issue 尚未解决。 | gap、risk、possible_error、todo。 | “adaptedness argument may fail”。 |
| `resolved` | issue 已解决，保留追踪。 | 曾经打开的问题。 | 已由新的 finite-window argument 解决的 gap。 |
| `disproved` | 已知为错误路线、错误命题或失败假设。 | false claim、失败证明、错误推导。 | naive duality proof 由于 adaptedness 失败。 |
| `obsolete` | 被新对象替代，不再作为当前路线使用。 | 旧表述、旧证明、过时笔记。 | 旧 theorem statement 被 refined statement 替代。 |
| `archived` | 历史材料或休眠材料，通常不应进入当前活动路线。 | 会议旧笔记、过时实验路线。 | 早期 brainstorm，保留但不用于当前 proof route。 |

推荐组合：

- `math`：`draft`, `partial`, `needs_check`, `checked`, `disproved`, `obsolete`, `archived`。
- `issue`：`open`, `resolved`, `obsolete`, `archived`。
- `note`：`draft`, `checked`, `obsolete`, `archived`。

不要写 `status: false`。错误路线用 `status: disproved`，被替代路线用 `status: obsolete`。

route resolver 会使用 status 做 proof 选择：

- proof 候选按 `checked`、`needs_check`、`partial`、`draft` 优先。
- `disproved`、`obsolete`、`archived` 默认不作为 proof 候选。
- 如果 route `proof_choices` 显式选择了 `disproved`、`obsolete` 或 `archived` proof，resolver 会给 warning，但仍尊重显式选择。

状态迁移建议：

```text
draft -> partial -> needs_check -> checked
open -> resolved
needs_check -> disproved
checked -> obsolete
obsolete -> archived
```

不要为了“暂时不看”而把数学对象标成 `open`；`open` 是 issue 的状态。数学对象暂时不用通常写 `obsolete` 或 `archived`。

## `priority`

只用于 `issue`。非 issue 写了也会被保留，但没有推荐意义。

```text
blocker
high
normal
low
```

| priority | 何时使用 |
|---|---|
| `blocker` | 不解决就无法判断主路线是否成立。 |
| `high` | 影响重要证明或主要结论，但有绕路可能。 |
| `normal` | 普通待办或复核问题；issue 默认值。 |
| `low` | 清理、润色、补引用等不阻塞当前数学判断的工作。 |

例子：

```yaml
kind: issue
role: possible_error
status: open
priority: blocker
title: Adaptedness of the naive duality control is unclear
edges:
  blocks:
    - target: main.proof.naive_duality
```

## `provenance`

表示信任边界。

```text
internal
external
imported
```

| provenance | 含义 | route/export 行为上的意义 |
|---|---|---|
| `internal` | 当前项目内部建立或维护的对象。 | 未证明的 internal claim 会让 proof route 变成 unresolved。 |
| `external` | 外部文献、定理库、已接受来源。 | 外部 claim 没有 proof 时可作为 boundary 使用。 |
| `imported` | 从其他项目或工具导入，本项目不维护完整证明。 | 类似外部材料，但表示来源可能是另一个本地 atlas。 |

文献结果通常写：

```yaml
kind: note
role: literature
display_as: literature_note
provenance: external
status: checked
```

如果某个外部 theorem 是证明主线的接受前提，可以建成 `kind: math`, `role: claim`, `provenance: external`，并用 `cites` 指向文献 note。

普通论文项目里不要新建本地 `source.*` 对象；`source.*` 命名空间保留给
Reference Atlas。若要在当前论文引用外部文献或外部结果，把 Reference Atlas 挂载到项目，
再用 `cites` 或 `uses` 指向其中的 `source.*` 对象。

## `citation`

`citation` 目前只手写 `bibkey`：

```yaml
citation:
  bibkey: Boyer2010
```

`trust`、`bibfile`、`registryId` 和 `entryType` 由 `bib-registry.yml` 派生，不要手写进
`object.yml`。旧对象里如果保留 `citation.bibfile`，校验会给 warning，因为 BibTeX 文件归属应由 registry 统一维护。

每个 `source.*` 对象都需要 `citation.bibkey`。如果 bibkey 不在当前项目和已挂载 Reference Atlas 的 Bib registry 中，严格校验会失败。

## `source_result`

`source_result` 用于说明一个外部数学结果如何来自文献对象：

```yaml
source_result:
  parent: source.boyer_2010a
  location: Theorem 2.1
  statement_fidelity: paraphrased
```

字段含义：

| 字段 | 含义 |
|---|---|
| `parent` | 对应的文献 note 对象名。 |
| `location` | 结果在文献中的位置，例如 theorem、lemma、page 或 section。 |
| `statement_fidelity` | 语句忠实度，例如 `verbatim`、`paraphrased`、`adapted`。 |

如果写了 `parent`，它必须能解析为当前图中的对象。

## `summary`

`summary` 是一段短文本，不是 Markdown body 的替代品。它用于：

- 对象列表和 route 节点摘要。
- route 导出中的 `summary` representation。
- soft dependency 的默认建议表示：有 summary 时通常用 `summary`，没有 summary 时退到 `reference`。

建议写成一到三句，说明“对象说了什么”和“为什么在图里重要”。不要把完整证明塞进 `summary`。

## `body`

`body` 必须是对象目录内的相对 `.md` 文件列表，不能写绝对路径，不能包含 `../`。

默认新建对象时的文件名由代码推导：

| 对象类型 | 默认 body 文件 |
|---|---|
| `math.claim` | `statement.md` |
| `math.proof` / `math.proof_fragment` | `proof.md` |
| `issue.*` | `note.md` |
| `note.*` | `note.md` |
| 其他 math 对象 | `body.md` |

正文规则：

- 对象 body 不要以 H1 (`# ...`) 开头；标题已经在 `object.yml.title`。
- 对象 body 可以用 `[[object.name]]` 普通链接。
- 对象 body 不能用 `![[object.name]]` 嵌入；嵌入只用于 view。
- 不要在对象 body 里定义 TeX 宏，例如 `\newcommand`、`\renewcommand`、`\def`。

statement representation 的抽取规则与 body 文件名有关：

- 有 `statement.md` 时，`statement` 表示使用 `statement.md`。
- `setting`、`notation`、`definition`、`model`、`construction`、`calculation` 没有 `statement.md` 时，可用第一个 body 文件作为 statement source。
- `claim`、`problem`、`assumption`、`equation`、`proof`、`proof_fragment`、`note` 没有 `statement.md` 时，不能可靠导出为 statement。

## `edges`

`edges` 只写正向边。v1 的 edge ref 使用对象形式：

```yaml
edges:
  requires:
    - target: main.setting.spectral_spaces
      strength: hard
      reason: The statement uses the spectral projectors.
  uses:
    - target: main.claim.observability
      strength: hard
  cites:
    - target: source.boyer_2010a
```

字段：

- `target`：必填，对象 `name` 或可解析 alias。
- `strength`：可选，`hard` 或 `soft`，默认 `hard`。
- `reason`：可选，说明依赖原因。

`requires` 表示读懂或陈述当前对象所需的上下文。`uses` 表示证明、推导、构造或计算实际使用的数学依赖。通常 claim 写 `requires`，proof/proof_fragment 写 `proves` 和 `uses`。

严格 schema 不接受旧的字符串列表形式：

```yaml
edges:
  uses:
    - main.claim.old_style
```
