# Balance anomalies

这是 baseline 自动异常筛查，不是平衡补丁清单。任何数值修改都应在第二个独立 balance 分支进行。

## P0

### HIGH_EVENT_REPEAT · 后期事件重复偏高

**证据：** DAY21-30 exact=52.2%，mechanical=72.4%。

**下一步：** 先定位重复来自 eventId、family 还是支付/拒绝等机械模板，再决定补内容还是调调度权重。

## P1

### DOMINANT_LOCATION · 探索地点高集中：convenience-store

**证据：** 自然策略 selectionRate=41.0%，平均净值=3.09。

**下一步：** 检查是否成为默认必刷路线；优先比较首次价值与重复价值，而不是直接削弱首次故事奖励。

### DEAD_LOCATION · 探索地点低使用：subway

**证据：** 自然策略 selectionRate=4.4%，平均净值=7.65。

**下一步：** 区分奖励弱、风险高、解锁过晚、信息表达弱或仅特殊状态有价值，再决定是否调整。

### DEAD_LOCATION · 探索地点低使用：gas-station

**证据：** 自然策略 selectionRate=3.3%，平均净值=0.94。

**下一步：** 区分奖励弱、风险高、解锁过晚、信息表达弱或仅特殊状态有价值，再决定是否调整。

### DEAD_LOCATION · 探索地点低使用：hospital

**证据：** 自然策略 selectionRate=1.0%，平均净值=-0.32。

**下一步：** 区分奖励弱、风险高、解锁过晚、信息表达弱或仅特殊状态有价值，再决定是否调整。

### DEAD_LOCATION · 探索地点低使用：bus-station

**证据：** 自然策略 selectionRate=3.5%，平均净值=-0.19。

**下一步：** 区分奖励弱、风险高、解锁过晚、信息表达弱或仅特殊状态有价值，再决定是否调整。

### DEAD_LOCATION · 探索地点低使用：warehouse

**证据：** 自然策略 selectionRate=0.8%，平均净值=-0.19。

**下一步：** 区分奖励弱、风险高、解锁过晚、信息表达弱或仅特殊状态有价值，再决定是否调整。

### DAY29_DOMINANT_CHOICE · DAY29 选择疑似假选择：final-last-hold

**证据：** final-horde-last-line 中 bestChoiceRate=78.3%，worstChoiceRate=12.1%。

**下一步：** 检查该选项是否在跨人口/食物/建筑/路线状态下仍占优；若是，再做条件化代价或收益修正。

### DAY29_DOMINANT_CHOICE · DAY29 选择疑似假选择：final-route-scout

**证据：** final-horde-reroute 中 bestChoiceRate=77.2%，worstChoiceRate=8.0%。

**下一步：** 检查该选项是否在跨人口/食物/建筑/路线状态下仍占优；若是，再做条件化代价或收益修正。

## P2

本轮自动阈值未标记问题。
