# v0.6.0 baseline playtest

Baseline tag/name: **v0.6.0-baseline-playtest**

- DAY1→30 完整模拟：10000
- baseline seed 起点：606000
- DAY29 synthetic states：3000
- 非法 policy action：0
- 自然策略：Random / Survival Greedy / Production Greedy / Exploration Greedy / Strong Heuristic
- 反事实原则策略：9 个 Principle Greedy
- 异常：P0: 1 · P1: 8 · P2: 0

## 自然策略结局 Top 5

| 结局 | 自然策略占比 |
| --- | --- |
| E09 | 62.2% |
| E12 | 28.7% |
| E10 | 4.1% |
| E05 | 2.7% |
| E11 | 1.3% |

## 解释边界

本报告不是“平均值排行榜”。CSV 同时输出 median、p10/p25/p75/p90 等分位数；原则、社区、地点、DAY29 与事件重复分别有专项报告。第一轮只测量，不对原则、社区、地点、结局或事件池做大规模重写。
