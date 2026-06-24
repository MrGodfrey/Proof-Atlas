# 核心概念与操作流程

这篇文档回答三个问题：

- Proof Atlas 里哪些概念最重要？
- 为什么网页看起来是只读的？
- 在具体场景里应该怎么操作？

## 最重要的五件事

### 文件是事实源

`ProofAtlas/` 目录里的 YAML 和 Markdown 是事实源。网页只是读取这些文件并展示对象图。

这意味着：

- 修改对象、边、route 或正文时，用编辑器、CLI 或本地 AI 改文件。
- 改完后用 `npm run atlas -- check --strict <project>` 校验。
- 网页监听文件变化后重新构建视图。
- git diff 就是审计记录。

### 对象比章节更重要

Proof Atlas 不先问“这一段放在第几章”，而是先问“这是什么对象”：

- `claim`：需要证明的结论。
- `proof`：完整证明、局部论证、计算、构造过程或失败/草稿证明。
- `setting` / `definition` / `notation` / `assumption`：读懂陈述需要的背景和对象引入。
- `issue`：阻塞、风险、待办或缺口。
- `literature` / `source`：文献和来源。

章节和阅读顺序由 `views/*.md` 或 `views/*.route.yml` 组织；对象本身保持稳定。

### 边表达数学关系

对象之间的边决定 route、导出和校验能不能工作：

- `requires`：为了读懂或陈述当前对象，必须先知道的上下文。
- `uses`：为了证明、推导、构造或计算当前对象实际使用的依赖。
- `proves`：proof 证明哪个 claim。
- `blocks`：issue 阻塞哪个对象。
- `cites`：文献或外部来源。

一般规则是：claim 多写 `requires`，proof 多写 `proves` 和 `uses`。

### Manual View 和 Generated View 不一样

`views/*.md` 是 Manual View：作者手工组织的阅读入口，适合像论文一样阅读。

`views/*.route.yml` 是 Generated View：保存 proof-obligation target、proof choice、boundary 和表示粒度，由 resolver 计算出 Proof Tree。

Generated View 的 Proof Tree 和 Narrative 都是输出，不是编辑器。浏览器里展开、收起或选中节点都不会改文件。

### 本地 AI 和云端 AI 用法不同

本地 AI 可以读本机文件，所以网页通常只复制稳定引用：

```text
uid
name
path
body files
selection excerpt
```

云端 AI 不能读本地文件，所以需要 `npm run atlas -- export ...` 物化一份完整 Markdown context。

## 常见场景

### 场景一：阅读一篇 Proof Atlas 项目

目标：像读论文一样先建立整体感，再按需跳进对象图。

1. 启动网页：

```bash
npm run atlas -- dev examples/semidiscrete --port 3217
```

2. 在左栏打开 `Dashboard` 或 `Paper` 这类 Manual View。
3. 在中栏按顺序阅读对象卡片。
4. 在中栏单击对象卡片或正文链接，在右栏查看元数据、依赖和反向依赖。
5. 双击中栏对象卡片或点击打开图标，进入对象完整页。左栏对象树单击会直接打开完整页。
6. 用浏览器 Back 回到原阅读位置。

适合这个场景的按钮：

- `Filter`：暂时隐藏 draft、archived 或某类对象。
- 对象卡片复制图标：把对象引用交给本地 AI。
- 右栏打开完整页图标：深入读一个对象。

### 场景二：检查一个 claim 当前采用哪条证明路线

目标：知道一个结论由哪些 proof、claim、setting 和 calculation 支撑。

1. 在左栏打开对应的 Generated View，例如 `Why null controllability holds`。
2. 先看 `Proof Tree` 顶部的 target claim 和 selected proof。
3. 用 disclosure 箭头逐层展开 proof 的直接 uses；需要整体查看时用 `Expand main path`。它会沿当前树的展示顺序深度展开，但同一对象只自动展开第一次出现的位置。
4. 单击某个节点正文，在右栏查看 `Route inclusion`。
5. 重点看这些字段：

| 字段 | 应该检查什么 |
|---|---|
| `decision` | 是否有 `unresolved`。 |
| `witness path` | 这个节点为什么被纳入。 |
| `representation` | hard dependency 是否至少有 statement。 |
| `diagnostics` | 是否有 proof choice、statement 或 proof-tree target 问题。 |
| `boundary type` | boundary 是 accepted input 还是 context cut。 |

6. 点击 `Route` 复制 CLI 命令，在终端复现解析结果：

```bash
npm run atlas -- route views/null_controllability.route.yml examples/semidiscrete/ProofAtlas
```

这个流程只检查 route，不写项目文件。

### 场景三：给云端 AI 准备可读 context

目标：把某条证明路线导出成脱离本地项目也能读的 Markdown。

1. 打开 Generated View，确认 route 没有明显诊断。
2. 点击 `Export` 复制导出命令。
3. 在终端运行并指定输出文件：

```bash
npm run atlas -- export views/null_controllability.route.yml \
  examples/semidiscrete/ProofAtlas \
  --format markdown \
  --output /tmp/null-control-context.md \
  --snapshot /tmp/null-control.snapshot.yml
```

4. 把 `/tmp/null-control-context.md` 发给云端 AI。
5. 如果要保留这次喂给云端 AI 的精确材料，同时保存 snapshot。

注意：`Export` 按钮只复制命令。浏览器不会直接写 `/tmp/...` 文件。

### 场景四：让本地 AI 修改一个对象

目标：让本地 AI 精确定位对象并修改本地文件。

1. 在网页中选中对象。
2. 点击复制图标或 `Copy local AI reference`。
3. 把复制内容交给本地 AI，并说明任务，例如：

```text
请根据这个 Proof Atlas local reference，打开对应 object.yml 和 statement.md。
目标：补充 summary，并检查 requires 是否覆盖 statement 中引用的对象。
不要改 unrelated 文件。
```

4. 本地 AI 修改文件后，运行：

```bash
npm run atlas -- check --strict <project>
```

5. 回到网页看 `Build OK` 是否恢复。

这种场景不要复制整篇正文给 AI。稳定引用加本地文件读取更可靠。

### 场景五：新增一个数学对象

目标：把一个新引理、证明、定义、setting 或 issue 放进对象图。

1. 先判断对象角色：

```text
claim / proof / setting / notation / definition / assumption / issue
```

2. 用 CLI 创建对象：

```bash
npm run atlas -- new math claim main.claim.some_result "Some result" <project>
```

3. 编辑 `object.yml`：

- 给 claim 写 `requires`。
- 给 proof 写 `proves` 和 `uses`。
- 给 issue 写 `blocks`。
- 给文献写 `cites`。

4. 写 `statement.md` 或正文文件。
5. 把对象嵌入合适的 `views/*.md`，或者把它纳入某个 `views/*.route.yml` 的依赖链。
6. 运行 strict check。

### 场景六：创建或调整 Generated View

目标：保存一条可重复解析的 proof route。

1. 用 CLI 先解析目标对象：

```bash
npm run atlas -- route main.claim.null_controllability \
  examples/semidiscrete/ProofAtlas \
  --profile proof
```

2. 如果默认 proof choice 不符合预期，显式指定：

```bash
npm run atlas -- route main.claim.null_controllability \
  examples/semidiscrete/ProofAtlas \
  --profile proof \
  --proof-choice main.claim.observability=main.proof.observability
```

3. 如果某个外部输入或深层背景不想继续展开，设为 boundary：

```bash
npm run atlas -- route main.claim.null_controllability \
  examples/semidiscrete/ProofAtlas \
  --profile proof \
  --boundary source.boyer_2010a.claim.partial_discrete_lr
```

4. 保存为 route 文件：

```bash
npm run atlas -- route main.claim.null_controllability \
  examples/semidiscrete/ProofAtlas \
  --profile proof \
  --save views/null_controllability.route.yml
```

5. 回到网页，左栏会出现 Generated View。

浏览器中的 Proof Tree 只是帮助阅读这条 route；如果要改变 proof choice、boundary 或 representation，改 route 文件或用 CLI。

### 场景七：处理 LLM 建议

目标：让工具或本地 AI 提出候选修改，但保持人工确认。

1. 生成 pending suggestion set：

```bash
npm run atlas -- suggest examples/semidiscrete/ProofAtlas \
  --route views/null_controllability.route.yml \
  --output .atlas/suggestions/null_control.yml
```

2. 打开 suggestion 文件复核每一条建议。
3. 只接受明确确认的 ID：

```bash
npm run atlas -- apply-suggestions .atlas/suggestions/null_control.yml \
  examples/semidiscrete/ProofAtlas \
  --accept sug_edge_main_claim_a_requires_main_setting_b
```

4. 运行 strict check 并检查 git diff。

不要把 LLM 建议直接当成对象图事实。没有 `--accept` 时，`apply-suggestions` 会拒绝写入。

### 场景八：排查 `Build error` 或 strict check 失败

目标：把对象图恢复到可构建、可追踪状态。

1. 点击顶部 `Build error` 或 `problem(s)`。
2. 看问题列表，点击相关问题跳到对象。
3. 常见修复方向：

| 问题 | 修复方向 |
|---|---|
| edge target 不存在 | 修正对象名，或先创建目标对象。 |
| route target 不存在 | 修正 `views/*.route.yml` 的 `target`。 |
| proof choice 不成立 | 确认 proof 是否有 `proves` 指向该 claim。 |
| hard dependency 被设为 `omit` | 改为 `statement`、`summary` 或 `full`。 |
| 缺少 statement | 增加 `statement.md`，或调整对象 role / representation。 |
| `G_dep` 有环 | 检查 hard `requires` / `uses`，必要时改为 soft 或重新建模。 |

4. 修完后运行：

```bash
npm run atlas -- check --strict <project>
```

## 使用原则

- 先建模事实，再组织阅读顺序。
- claim 的证明依赖尽量放到 proof 的 `uses`，不要塞进 claim 的 `uses`。
- route 用来回答“当前采用哪条路线”，不是替代对象图。
- boundary 是人为切断点，必须在导出中可见。
- hard dependency 在 proof route 中不能只给 reference。
- 网页只读；写回必须能被 git diff 审计。
- 云端 AI 需要 materialized context，本地 AI 需要稳定引用。
