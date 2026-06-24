# 拆分粒度建议

对象太粗会失去跳转能力；对象太细会制造维护负担。

## 推荐规则

- 主问题、主定理、主证明必须是对象。
- 每个会被复用的定理、引理、命题、估计应是对象。
- 证明中有独立意义的构造过程、推导或长计算可以升格为 `proof` 支撑对象。
- 文献输入应建成 `note/literature` 对象，并通过 `cites` 连接。
- 审稿意见和待检查点应建成 `issue`；失败路线或草稿证明应建成 `proof`，用 `status: obsolete/draft/partial` 表达状态。
- 每个公式不必都变成对象。只有需要反复引用、单独检查或被多个证明依赖，并且有独立数学语义的公式性材料才需要升格。
- 如果公式只在同一个 proof 或 definition 对象内部被引用，保留在该对象中，并使用自然语言或本地公式编号，例如 `(LPE1)`。
- 不使用 `equation` 作为对象类型或 `display_as`。前向/后向系统、时间网格、算子和构造对象通常用 `definition` 或 `setting`；证明内部代数整理和构造步骤用 `proof`；可复用断言用 `claim`，标题或 summary 说明它是 estimate、identity 或 formula。
- 被升格的 claim 或 proof-support object 必须自足：正文从完整句子开始，说明符号和假设来源，给出公式，并说明它在证明中承担的作用。

## 对半离散论文的拆分策略

- 论文段落级背景放入 `note`。
- 概率空间、区域假设、网格、算子、谱空间放入 `setting` 或 `definition`。
- 主定理和三个预备命题放入 `claim`。
- 每个证明放入 `proof`。
- 主证明中的时间网格拆为 `definition`，乘积估计和指数整理拆为 `proof` 支撑对象。
- 适应性问题保留为 `issue`，并标记为已解决审计项。
- 重要公式性材料按语义升格为 `claim` 或 proof-support 对象；对象名可以保留来源语义，但 `role` 不再使用 `statement` / `estimate` / `calculation`。
- 被升格的对象保留完整上下文；同一对象内的多条公式使用本地编号，而不是拆成一批无上下文小对象。
- 文献 citation key 建成 `source.*` 文献对象。

## 不建议放进对象正文的内容

- TeX preamble。
- TeX authoring notes。
- 原始 TeX label。
- 作者联系方式。
- 只服务于排版的命令或注释。

Proof Atlas 对象正文应服务于数学阅读、证明跳转、依赖说明和研究状态管理。
