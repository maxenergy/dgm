# Darwin Gödel Machine VSCode Extension

一个基于进化计算原理的自进化VSCode扩展，能够通过经验验证持续改进代码生成能力。

## 🌟 项目特色

- **自进化架构**: 基于Darwin Gödel Machine原理的开放式进化探索
- **安全沙盒**: vm2 NodeVM容器提供安全的代码执行环境
- **多代理协作**: 专业化生命周期代理协同工作
- **AI增强**: 集成多种大语言模型（GPT、Claude、OpenRouter）
- **智能上下文**: 深度理解项目结构和用户意图

## 📁 项目文档

- [📋 产品需求文档 (PRD)](./prd.md) - 详细的技术架构和实现策略
- [🔧 开发任务分解](./task-breakdown.md) - 完整的文件结构和功能描述
- [📊 项目概览](./project-overview.md) - 技术挑战、商业价值和成功指标

## 🏗️ 技术架构

```
┌─────────────────────────────────────┐
│         VSCode Extension Host        │
├─────────────────────────────────────┤
│  Core Extension (TypeScript)        │
│  ├── ClineProvider (Agent Manager)  │
│  ├── Task Execution Engine          │
│  └── State Management               │
├─────────────────────────────────────┤
│  Evolution Layer (New)              │
│  ├── DGM Evolution Engine           │
│  ├── Mutation Generator             │
│  └── Fitness Evaluator              │
└─────────────────────────────────────┘
```

## 🚀 开发阶段

### Phase 1: 基础架构 (第1-4周)
- [x] 项目初始化
- [ ] 安全沙盒实现
- [ ] 遥测收集框架
- [ ] 核心类型定义

### Phase 2: 进化引擎 (第5-8周)
- [ ] 进化算法核心
- [ ] 种群管理系统
- [ ] 归档管理机制
- [ ] 基础代理框架

### Phase 3: 高级特性 (第9-12周)
- [ ] AI模型集成
- [ ] MCP协议支持
- [ ] 用户界面开发
- [ ] 智能服务层

### Phase 4: 生产就绪 (第13-16周)
- [ ] 性能优化
- [ ] 安全审计
- [ ] 文档完善
- [ ] 部署自动化

## 🛠️ 技术栈

- **核心**: TypeScript, Node.js, VSCode Extension API
- **安全**: vm2 NodeVM, 静态代码分析
- **AI集成**: OpenAI, Anthropic, OpenRouter
- **构建**: Webpack, Jest, GitHub Actions
- **协议**: Model Context Protocol (MCP)

## 📚 关键参考资料

### 理论基础
- [Sakana AI Darwin Gödel Machine](https://sakana.ai/dgm/)
- [DGM研究论文](https://www.researchgate.net/publication/392204438_Darwin_Godel_Machine_Open-Ended_Evolution_of_Self-Improving_Agents)
- [进化算法概述](https://en.wikipedia.org/wiki/Evolutionary_algorithm)

### 技术实现
- [VSCode扩展开发](https://code.visualstudio.com/api)
- [Roo-Cline架构](https://roocline.dev/)
- [vm2安全沙盒](https://github.com/patriksimek/vm2)

## 🎯 项目目标

- **技术目标**: 实现60%+的代码生成成功率
- **性能目标**: IDE启动时间增加<5%
- **用户目标**: 10,000+活跃用户，4.0+/5.0满意度
- **安全目标**: 0个严重安全问题

## 📈 预期影响

- **开发效率**: 30-80%编程效率提升
- **代码质量**: 自动化最佳实践应用
- **创新发现**: AI发现新的解决方案模式
- **范式转变**: 从静态工具到自适应助手

## 🤝 贡献指南

1. 阅读[开发任务分解](./task-breakdown.md)了解项目结构
2. 查看[项目概览](./project-overview.md)理解技术挑战
3. 参考[PRD文档](./prd.md)深入理解架构设计
4. 提交PR前确保通过所有测试和安全检查

## 📄 许可证

[MIT License](./LICENSE)

## 🔗 相关链接

- [VSCode扩展市场](https://marketplace.visualstudio.com/)
- [Darwin Gödel Machine官网](https://sakana.ai/dgm/)
- [模型上下文协议](https://modelcontextprotocol.io/)

---

**注意**: 本项目目前处于早期开发阶段，架构和功能可能会有较大变动。欢迎关注项目进展！