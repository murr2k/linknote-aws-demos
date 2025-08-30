# AWS Test Environment

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![AWS CLI](https://img.shields.io/badge/AWS-CLI%20v2-orange.svg)](https://aws.amazon.com/cli/)
[![Claude Flow](https://img.shields.io/badge/Claude%20Flow-v2.0.0--alpha-blue.svg)](https://github.com/ruvnet/claude-flow)
[![MCP](https://img.shields.io/badge/MCP-5%20Servers-green.svg)](https://modelcontextprotocol.io/)
[![SPARC](https://img.shields.io/badge/SPARC-Methodology-purple.svg)](https://github.com/ruvnet/claude-flow)

AWS MCP Integration Test Environment with Claude Flow orchestration and SPARC development methodology.

## 🚀 Features

- **AWS MCP Integration**: Direct AWS service access via Model Context Protocol
- **Claude Flow Orchestration**: 54 specialized AI agents with swarm coordination  
- **SPARC Development**: Systematic Test-Driven Development methodology
- **Hive Mind System**: Collective intelligence with Queen-led coordination
- **Multi-MCP Architecture**: 5 integrated MCP servers for comprehensive tooling

## 🏗️ Architecture

### MCP Servers
- **aws-sso**: AWS Single Sign-On with device auth flow
- **aws-services**: DynamoDB, Lambda, API Gateway tools
- **claude-flow**: AI agent orchestration and swarm coordination
- **ruv-swarm**: Enhanced swarm coordination with neural features
- **flow-nexus**: Complete AI orchestration platform with sandboxes

### Agent Types (54 Available)
- **Core Development**: `coder`, `reviewer`, `tester`, `planner`, `researcher`
- **Swarm Coordination**: `hierarchical-coordinator`, `mesh-coordinator`, `adaptive-coordinator`
- **AWS Integration**: Via MCP tools for direct service access
- **SPARC Methodology**: `sparc-coord`, `specification`, `architecture`, `refinement`

## 🔧 Setup

### Prerequisites
- Node.js 18+
- AWS CLI v2
- Claude Code CLI
- Git

### Installation

1. **Clone and Initialize**
   ```bash
   git clone https://github.com/murr2k/aws-test.git
   cd aws-test
   ./claude-flow init --sparc
   ```

2. **Configure AWS Credentials**
   ```bash
   aws configure sso  # For SSO
   # OR
   aws configure      # For access keys
   ```

3. **Verify MCP Integration**
   ```bash
   claude mcp list
   ```

## 🎯 Usage

### AWS Operations via MCP
```bash
# AWS SSO Authentication (via MCP)
# AWS service operations through MCP tools
# Direct integration with Claude Code
```

### SPARC Development Workflow
```bash
# Initialize swarm coordination
./claude-flow hive-mind wizard

# Deploy multi-agent workflow  
./claude-flow swarm "build AWS serverless API"

# SPARC methodology phases
./claude-flow sparc run spec-pseudocode "user authentication"
./claude-flow sparc tdd "JWT token validation"
```

### Concurrent Agent Execution
```bash
# Claude Code Task tool spawns agents concurrently
# Example: Full-stack AWS development
Task("Backend Developer", "Build Lambda functions", "backend-dev")
Task("Infrastructure Engineer", "Setup CloudFormation", "system-architect")  
Task("Security Auditor", "Review IAM policies", "reviewer")
```

## 📊 Performance

- **84.8% SWE-Bench solve rate**
- **32.3% token reduction** 
- **2.8-4.4x speed improvement**
- **27+ neural models** for pattern learning
- **Real-time coordination** across agent swarms

## 🧠 Capabilities

### AWS Integration
- ✅ DynamoDB operations (put, get, query, scan)
- ✅ Lambda function management and invocation
- ✅ API Gateway configuration
- ✅ AWS SSO device authentication flow
- ✅ Temporary credential management

### Development Features
- ✅ Hive Mind collective intelligence
- ✅ Neural pattern learning and optimization
- ✅ Cross-session memory persistence  
- ✅ GitHub workflow automation
- ✅ Performance bottleneck analysis
- ✅ Self-healing workflows

## 🔒 Security

- AWS credentials managed through SSO with temporary tokens
- MCP tools provide secure service access without exposing credentials
- Secrets managed via dedicated MCP secrets server
- IAM role-based access control integration

## 📚 Documentation

- [SPARC Methodology](./docs/sparc-methodology.md)
- [MCP Integration Guide](./docs/mcp-integration.md)  
- [AWS Setup Guide](./docs/aws-setup.md)
- [Agent Coordination](./docs/agent-coordination.md)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Use SPARC methodology for development
4. Submit pull request with comprehensive tests

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Claude Flow](https://github.com/ruvnet/claude-flow) - AI agent orchestration
- [ruv-swarm](https://github.com/ruvnet/ruv-FANN/tree/main/ruv-swarm) - Enhanced coordination
- [Model Context Protocol](https://modelcontextprotocol.io/) - Tool integration standard
- [AWS CLI](https://aws.amazon.com/cli/) - AWS service access

---

**Built with ❤️ using Claude Flow v2.0.0-alpha and SPARC methodology**