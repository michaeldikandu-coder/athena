# Athena - Reusable AI Agent Framework

**One skeleton, multiple agents.**

Athena is a reusable AI-agent framework that lets developers build one common agent skeleton and deploy it into multiple real-world applications. Build once, deploy many intelligent workflows across completely different systems.

## 🎯 Project Overview

Athena provides a shared runtime for:
- **Agent execution** - Tool calls, reasoning loops, and execution state
- **Tool management** - Registry, permissions, and validation
- **Workflows** - Multi-step actions with conditional logic
- **Memory** - Context storage and task history
- **Permissions** - Role-based access control and authorization
- **Human approval** - Pause sensitive actions for review
- **Integrations** - Connect REST APIs, webhooks, databases, and legacy systems
- **Real-time monitoring** - Track execution, tool calls, and status

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Athena Core                           │
│  Agent Runtime • Tools • Workflows • Memory • Permissions    │
│  Approvals • Events • Monitoring • Integrations              │
└─────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┴───────────────────┐
          ▼                                       ▼
┌─────────────────────┐               ┌─────────────────────┐
│    MoneyGuard       │               │      OpsGuard       │
│  Financial Agent    │               │   Operations Agent  │
└─────────────────────┘               └─────────────────────┘
```

## 📦 Monorepo Structure

```
athena/
├── packages/
│   ├── core/          # Agent runtime, tools, workflows, permissions
│   ├── database/      # MongoDB models and schemas
│   ├── integrations/  # REST, webhooks, legacy system bridges
│   └── shared/        # Shared utilities and types
├── apps/
│   ├── api/           # Backend API server
│   ├── dashboard/     # Web dashboard (Next.js)
│   ├── moneyguard/    # Financial operations agent
│   └── opsguard/      # Business operations agent
└── docs/
    ├── specs/         # Kiro specs and requirements
    ├── demo/          # Demo scripts
    └── architecture/  # Architecture diagrams
```

## 🚀 Getting Started

### Prerequisites

- Node.js 20+
- MongoDB (local or Atlas)
- npm 10+

### Installation

```bash
# Install all dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration

# Build all packages
npm run build

# Start development
npm run dev
```

### Environment Variables

Create a `.env` file in the root:

```env
# Database
MONGODB_URI=mongodb://localhost:27017/athena

# LLM Provider (Claude or Groq)
ANTHROPIC_API_KEY=your_key_here
# OR
GROQ_API_KEY=your_key_here

# JWT
JWT_SECRET=your_secret_here

# API
API_PORT=3001
API_URL=http://localhost:3001

# Dashboard
NEXT_PUBLIC_API_URL=http://localhost:3001
```

## 🛠️ Development

### Available Scripts

```bash
# Development mode (all workspaces)
npm run dev

# Build all packages
npm run build

# Type checking
npm run type-check

# Linting
npm run lint

# Clean node_modules
npm run clean
```

### Working with Workspaces

```bash
# Run command in specific workspace
npm run dev -w @athena/core

# Install dependency in specific workspace
npm install axios -w @athena/api

# Run script in all workspaces
npm run build --workspaces
```

## 🎭 Demo Applications

### MoneyGuard - Financial Operations Agent

Monitors transaction events, investigates suspicious activity, and executes approved financial actions.

**Features:**
- Transaction event monitoring
- Risk rule evaluation
- Customer profile analysis
- Fraud pattern detection
- Human approval for sensitive actions
- Complete audit trail

### OpsGuard - Business Operations Agent

Responds to operational events, diagnoses issues, and coordinates incident response.

**Features:**
- Operational event monitoring
- Multi-system information gathering
- Root cause identification
- Incident summarization
- Team notifications
- Task/ticket management

## 📚 Documentation

- [Complete Specification](./athena-spec.md) - Full project requirements and architecture
- [API Documentation](./docs/api/) - Backend API reference
- [Architecture Diagrams](./docs/architecture/) - System design and data flow

## 🔒 Security

- Tool permissions and access control
- Human approval for sensitive actions
- JWT-based authentication
- Input validation and sanitization
- Secure secrets management
- Comprehensive audit logging

## 🧪 Testing

```bash
# Run tests (when implemented)
npm test

# Run tests in watch mode
npm test -- --watch
```

## 📝 Tech Stack

- **Frontend**: Next.js 14, React 18, TypeScript, Tailwind CSS
- **Backend**: Node.js 20, Express, TypeScript
- **Database**: MongoDB with Mongoose
- **AI/LLM**: Anthropic Claude or Groq
- **Real-time**: WebSocket
- **Authentication**: JWT + bcrypt
- **Validation**: Zod
- **Monorepo**: npm workspaces

## 🎯 MVP Scope

### Core Features
- [x] Project structure and configuration
- [ ] Agent runtime with LLM integration
- [ ] Tool registry and execution
- [ ] Workflow engine
- [ ] Permission system
- [ ] Human approval flow
- [ ] Memory system
- [ ] Event system
- [ ] Real-time execution monitoring
- [ ] Web dashboard
- [ ] MoneyGuard application
- [ ] OpsGuard application
- [ ] User authentication

## 🤝 Contributing

This is a hackathon project for Kiro's Skeleton Crew category. Development is tracked through Kiro specs and sessions.

## 📄 License

MIT

## 🏆 Hackathon

**Category**: Skeleton Crew  
**Deadline**: Friday, December 4, 2026 at 2 PM PT  
**Goal**: Build a reusable agent skeleton and demonstrate it with two distinct applications

---

Built with [Kiro](https://kiro.dev) - AI-powered development environment
