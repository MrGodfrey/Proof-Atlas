# 拆分粒度建议

对象太粗会失去跳转能力；对象太细会制造维护负担。

## 推荐规则

- 主问题、主定理、主证明必须是对象。
- 每个会被复用的定理、引理、命题、估计应是对象。
- 证明中有独立意义的构造或长计算可以升格为 `construction` 或 `calculation`。
- 文献输入应建成 `note/literature` 对象，并通过 `cites` 连接。
- 审稿意见、待检查点和失败路线应建成 `issue` 或 `proof_fragment`，不要藏在正文注释里。
- 每个公式不必都变成对象。只有需要反复引用、单独检查或被多个证明依赖的公式才需要升格。

## 对半离散论文的拆分策略

- 论文段落级背景放入 `note`。
- 概率空间、区域假设、网格、算子、谱空间放入 `setting/model`。
- 主定理和三个预备命题放入 `claim`。
- 每个证明放入 `proof`。
- 主证明中的时间网格和乘积估计单独拆为 `construction` 和 `calculation`。
- 适应性问题保留为 `issue`，并标记为已解决审计项。
- 重要公式升格为 `main.eq.*` equation 对象。
- 文献 citation key 建成 `source.*` 文献对象。

## 不建议放进对象正文的内容

- TeX preamble。
- TeX authoring notes。
- 原始 TeX label。
- 作者联系方式。
- 只服务于排版的命令或注释。

Proof Atlas 对象正文应服务于数学阅读、证明跳转、依赖说明和研究状态管理。
