# Markdown 链接

## 普通链接

```markdown
我们使用 [[main.claim.observability]]。
```

## 自定义显示文字

```markdown
我们使用 [[main.claim.observability|可观测性估计]]。
```

## View 嵌入

```markdown
![[main.claim.null_controllability]]
![[main.claim.null_controllability]]{expanded}
```

嵌入只允许出现在 `views/` 中。对象正文中禁止 `![[...]]`。

## 规则

- `[[...]]` 可以写在对象正文和 view 中。
- `![[...]]` 只能写在 view 中。
- `![[name|text]]` 非法，嵌入不支持显示文字。
- `![[name]] {expanded}` 非法，`{expanded}` 前不能有空格。
- 数学公式、代码块和行内代码里的 `[[...]]` 不会被解析为对象链接。

## 显示约定

- 链接目标是 `role: literature` 或 `display_as: literature_note` 时，网页渲染为方括号样式，例如 `[Boyer 2010]`。
- 其他对象保持普通链接样式。

这个约定只影响网页渲染，不改变 Markdown 源文件和对象身份。

## 公式引用

如果引用的是同一个 Markdown 对象内部的公式，不要写指向当前对象自己的 Atlas 链接。优先使用自然语言：

```markdown
Combining the previous two estimates, ...
```

如果同一个对象内部有多个公式需要互相引用，可以使用本地公式编号。本地编号只在当前对象内有效，导出时作为普通 Markdown / LaTeX 内容保留：

```markdown
We first use the one-step estimate (LPE1).

$$
\begin{aligned}
...
\end{aligned}
\tag{LPE1}
$$

Combining (LPE1) with the cutoff identity (LPE2), ...
```

本地编号约束：

- 编号应在同一个对象内唯一。
- 使用短的语义前缀，例如 `LPE1`、`BAS1`、`OSB1`。
- 不要依赖项目级 TeX `\label` / `\ref` 机制。
- 其他对象不应直接引用某个对象内部的本地编号。

如果一个公式需要跨对象引用、反复复用或单独检查，不要把它机械升格成 `equation` 对象。先判断它在论文中承担的语义，再升格成对应对象：

- 前向/后向系统：`role: model`。
- 权函数、截断、时间网格、控制构造：`role: construction` 或 `role: definition`。
- 关键不等式或谱界：`role: claim`, `display_as: estimate`。
- 命名恒等式、表示公式、低频消去陈述：`role: claim`, `display_as: statement`。
- 指数整理或长代数推导：`role: calculation`。

例如一个可复用恒等式可以写成：

```yaml
kind: math
role: claim
display_as: statement
name: main.statement.energy_identity
```

正文中用正常对象链接引用：

```markdown
结合 [[main.statement.energy_identity]] 和 [[main.claim.observability]]，……
```

被升格的对象不是 TeX label 的机械替代品。它的正文应从完整句子开始，说明所用符号和假设来自哪里，并解释这个 statement / estimate / calculation 在当前证明中怎样使用。跨对象引用应指向这个对象本身，而不是指向对象内部的本地编号。
