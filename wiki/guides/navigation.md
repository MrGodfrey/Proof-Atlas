# 页面和跳转

网页的核心布局是三栏：

- 左栏：view 列表和对象树。
- 中栏：当前 view 的阅读区。
- 右栏：当前选中对象的详情和关系。

网页本身是只读浏览层。它会读取本地 `ProofAtlas/` 文件并展示对象图，但不会直接写
`object.yml`、正文 Markdown、`views/*.route.yml`、导出文件，或最近项目 registry
`~/.proof-atlas/projects.yml`。需要写文件时，使用 CLI、本地 AI 或编辑器。

## 顶部工具栏

顶部工具栏控制当前项目、过滤条件和构建状态：

| 按钮 | 作用 | 是否写文件 |
|---|---|---|
| 菜单图标 | 显示或隐藏左栏。 | 否 |
| `Open` | 输入项目路径、paper root 或最近项目 ID，切换当前打开的 Proof Atlas 项目，但不登记项目。 | 否 |
| `Filter` | 过滤左栏和 view 中显示的对象状态、对象 kind。 | 否 |
| `Build OK` / `problem(s)` / `Build error` | 查看当前对象图的校验结果。点击问题可以跳到相关对象。 | 否 |

`Build OK` 表示当前读取到的对象图没有构建错误。它不是测试全部数学内容正确，只说明文件协议、引用和图构建没有发现阻断性问题。

## 左栏

左栏上半部分列出 `views/` 中的 Markdown view，例如：

- `dashboard.md`
- `paper.md`
- `proof_map.md`
- `gaps.md`
- `sources.md`

点击 view 会切换中栏阅读入口。

如果 `views/` 里有 `*.route.yml`，左栏也会列出 Generated View，并带有 `Generated`
标签。Markdown view 是作者手工组织的阅读入口；Generated View 是从 proof route 配方解析出的 Proof Tree。

左栏下半部分是对象树。对象按 `name` 的点分结构分组：

```text
main
  claim
    null_controllability
    observability
  proof
    lr_iteration
source
  boyer_2010a
```

在左栏对象树中，单击对象会直接进入对象完整页。左栏对象树更像目录导航，
不是右栏预览列表。

左栏对象搜索框 `Filter objects...` 只过滤当前可见对象，不修改任何文件。
`Show archived & obsolete` 会显示归档或已废弃对象，适合追踪历史路线。

## 中栏：Manual View

Manual View 是 `views/*.md` 里的手工阅读入口，不是对象本身。

```markdown
# 全文阅读路线

## 记号与模型

![[main.setting.probability_and_spaces]]{expanded}

![[main.model.forward_semidiscrete_system]]{expanded}
```

`![[...]]` 表示把对象嵌入当前 view。

`{expanded}` 表示初始展开正文。没有 `{expanded}` 时，卡片先显示标题、摘要、状态和元数据。

对象卡片里常见按钮：

| 控件 | 作用 | 典型用法 |
|---|---|---|
| 复制图标 | 复制 `Copy local AI reference`。 | 把当前对象交给本地 AI 精确定位。 |
| 展开/折叠箭头 | 展开或收起对象正文。 | 先看结构，再按需读正文。 |
| `Show proof` | 对 proof 卡片展开证明正文和使用的依赖。 | 避免一开始铺满长证明。 |
| `Open full page` 图标 | 进入对象完整页。 | 深入阅读某个对象和它的关系。 |

中栏对象卡片、Generated View 节点和右栏关系行遵循同一条交互规则：单击通常只更新右栏，
双击进入对象完整页。

如果对象来自挂载的 Reference Atlas，卡片会显示 `global references: <id>`、`bibkey`、
`trusted` / `unverified` / `rejected` trust chip，以及外部结果的 fidelity。它们来自
对象 origin、`citation` 和 `source_result`，不是单独的编辑控件。

## 中栏：Generated View

Generated View 来自 `views/*.route.yml`，它不是手写文章，而是 route resolver
根据 proof-obligation target、proof choice、boundary 和 representation 计算出的 Proof Tree。

页面标题下方会显示：

```text
target object · proof tree · route status
```

这行说明当前生成视图的目标和 route 是否闭合。紧凑摘要条还显示 target status、
boundary 数、proof choice 数、diagnostics 数和 token 估算。

Generated View 顶部有两个复制按钮：

| 按钮 | 复制什么 | 什么时候用 | 是否写文件 |
|---|---|---|---|
| `Local AI` | 复制一段给本地 AI 的短引用，包含当前项目、route 文件和 target。 | 想让本地 AI 读取项目文件，审查这条 route、建议缺边、summary 或叙事顺序。 | 否 |
| `Export` | 复制一段可直接粘贴到 Terminal 的命令。命令会进入 Proof Atlas 工具仓库，导出当前 route 的 Markdown context 到 `ProofAtlas/.atlas/exports/`，并在 macOS 上用 `pbcopy` 放入剪贴板。 | 想生成可发给云端 AI 的完整 Markdown context。 | 复制按钮不写；运行命令会写入 `.atlas/exports/`。 |

这两个按钮都只是复制文本到剪贴板。浏览器不会替你创建 route、不会把 LLM 建议写回对象，也不会直接导出文件。

### Export 命令中的路径从哪里来

`Export` 按钮复制的是本机 Terminal 命令。命令里的路径不是源码硬编码，也不来自 wiki
示例，而是在当前 dev server 运行时生成：

- `TOOL_ROOT` 来自正在运行的 Proof Atlas 工具仓库，也就是包含 `package.json`
  和 `npm run atlas` 的目录。
- `ATLAS_ROOT` 来自当前网页已经打开的项目，即当前 graph 的 `atlasRoot`。
- `ROUTE_FILE` 来自当前 Generated View 对应的 `views/*.route.yml` 文件；后端会校验它必须属于当前项目的 `routeViews`。
- `OUT` 默认派生为当前项目下的 `ProofAtlas/.atlas/exports/<route>.context.md`。

因此，同一个按钮在不同项目中复制出的命令会不同；它指向的是你当前网页正在看的项目和
route。路径使用绝对路径并做 shell quoting，所以即使 Terminal 当前目录不是 Proof Atlas
工具仓库，也可以直接粘贴运行。

通常不需要手动配置这些路径。需要改变路径时：

1. 换项目：用网页顶部 `Open` 打开新的 paper root 或 `ProofAtlas/` 目录，再点 `Export`。
2. 移动项目目录：重新 `Open` 新路径，或者重启 dev server 时传入新路径。
3. 移动工具仓库：从新的工具仓库目录重新启动 `npm run atlas -- dev ...`。
4. `3217` 上的服务是旧进程时：重启 dev server；旧进程不会自动拥有新加的 API。

命令里会包含本机绝对路径，例如用户名、仓库路径和项目路径。这些不是写死在源码里的个人信息，
而是为了让本机 Terminal 可以从任意目录运行。如果不希望把本机路径发给云端 AI，不要把
这条 Terminal 命令本身贴给云端；在本机运行它后，再把生成的 Markdown context 贴给云端。
在 macOS 上命令会用 `pbcopy` 把 Markdown context 放入剪贴板；没有 `pbcopy` 时，它只会打印
写入的文件路径。

如果 route 有 open nodes 或 diagnostics，顶部提示和诊断项会显示在 Generated View 顶部。
其中能解析到对象的名称或诊断项可以点击；点击只会在右栏选中相关对象，方便查看
`Route inclusion`，不会修改 route 文件。

Generated View 有两个只读 tab：

| Tab | 作用 |
|---|---|
| `Proof Tree` | 默认视图。先显示 target claim 和 selected proof，再由用户逐层展开 proof 的直接 uses。 |
| `Narrative` | 显示与 target 或 selected proof `related_to` 的 note 正文；没有 note 时显示空态。 |

Proof Tree 里的控件：

| 控件 | 作用 |
|---|---|
| disclosure 箭头 | 只展开或收起当前树节点，不改变右栏选中对象。 |
| `Expand main path` | 展开 proof tree 主路径。 |
| `Collapse all` | 收起整棵 proof tree。 |
| 单击节点正文 | 只更新右栏，展示该对象为什么被 route 纳入。 |
| 双击节点正文 | 进入对象完整页。 |

Generated View 中的 proof tree 不是编辑器。展开、收起、高亮和点击都不会改变 route 文件。

## 正文链接

对象正文中可以使用普通对象链接：

```markdown
这个证明使用 [[main.claim.observability]]。
```

也可以指定显示文字：

```markdown
这个证明使用 [[main.claim.observability|可观测性估计]]。
```

点击正文里的对象链接会跳到对应对象或在右栏打开对应对象详情。这样用户可以从主定理进入证明，从证明进入引理，再进入文献对象或 issue。

正文链接指向 `source.*` 对象时，如果对应 Reference Atlas 已挂载，网页会像普通对象一样打开它；如果挂载缺失，构图问题会提示缺少 Reference Atlas，而不是把每个 `source.*` 链接都当成独立断链。

## 右栏详情

右栏是当前选中对象的只读详情面板。普通对象会展示：

- `title`
- `uid`
- `name`
- `kind`
- `role`
- `display_as`
- `status`
- `importance`
- `priority`
- `origin`
- `citation`
- `source_result`
- `edges`
- 派生反向边
- body 文件列表
- `Copy local AI reference`

右栏顶部按钮：

| 按钮 | 作用 |
|---|---|
| 后退 / 前进箭头 | 使用浏览历史在选中过的对象和页面之间移动。 |
| 复制图标 | 复制当前对象的 local AI reference。 |
| 打开完整页图标 | 把当前对象打开为中栏完整对象页。 |
| 关闭图标 | 关闭右栏。 |

`Copy local AI reference` 复制的是短引用，而不是整段正文。原因是本地 AI 可以直接读取文件，短引用更稳定。

在 Generated View 中选中节点时，右栏会额外显示 `Route inclusion`：

| 字段 | 含义 |
|---|---|
| `role` | route resolver 认为它在当前 slice 中扮演的角色，例如 obligation、support、source。 |
| `decision` | 当前对象是 expanded、boundary 还是 unresolved。 |
| `representation` | 导出时使用 full、statement、summary、reference 还是 omit。 |
| `hardness` | 该对象是 hard dependency 还是 soft/background。 |
| `depth` | 它离 route target 的依赖深度。 |
| `tokens` | 当前 representation 的 token 估算。 |
| `witness path` | 解释“为什么这个对象被纳入”的一条依赖路径。 |
| `marginal cost` | 升级或降级 representation 会增加或节省多少 token。 |
| `diagnostics` | 与该对象相关的 route 诊断。 |

这些信息用于解释 route，不是编辑控件。

## 对象完整页

双击对象、点击 `Open full page` 或从对象树打开对象时，中栏进入对象完整页。
对象完整页适合深入阅读单个对象：正文、元数据、它使用的对象、反向依赖、证明关系和阻塞 issue。

完整页顶部的 `Paper view` 返回按钮会回到包含该对象的 paper/manual view，并滚动到对应对象卡片。
浏览器 Back 会回到上一个实际历史位置。

## 交互规则总结

如果只记一条规则：中栏和右栏里的对象交互通常是单击查看详情、双击进入完整页；
左栏对象树单击就是打开完整页。所有写入动作都回到 CLI、本地 AI 或编辑器完成。
