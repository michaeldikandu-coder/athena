# Athena Project Conventions

## Code Style

### TypeScript
- Use strict mode (`strict: true` in tsconfig)
- Prefer `interface` over `type` for object shapes
- Use explicit return types for public functions
- Avoid `any` - use `unknown` if type is truly unknown
- Prefix unused parameters with underscore: `_param`

### Naming Conventions
- **Files**: kebab-case (e.g., `agent-runtime.ts`)
- **Directories**: kebab-case (e.g., `tool-registry`)
- **Classes**: PascalCase (e.g., `AgentRuntime`)
- **Interfaces**: PascalCase (e.g., `IAgent`, `Tool`)
- **Functions**: camelCase (e.g., `executeWorkflow`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `MAX_RETRIES`)
- **Environment variables**: UPPER_SNAKE_CASE (e.g., `MONGODB_URI`)

### Project Structure
- Keep related code together (feature-based organization)
- Separate types in their own files when shared across modules
- Export public API through index files
- Keep implementation details private

## Error Handling

### Standard Pattern
```typescript
try {
  // operation
} catch (error) {
  if (error instanceof SpecificError) {
    // handle specific error
  }
  throw new AppError('Context about what failed', { cause: error });
}
```

### Custom Errors
- Create domain-specific error classes
- Include context in error messages
- Preserve error chains with `cause`

## Database (MongoDB)

### Models
- Define schemas in `packages/database/src/schemas/`
- Create models in `packages/database/src/models/`
- Use timestamps: `timestamps: true`
- Index frequently queried fields
- Use virtuals for computed properties

### Queries
- Use lean queries for read-only operations: `.lean()`
- Select only needed fields: `.select('field1 field2')`
- Limit query results appropriately
- Use aggregation for complex queries

## Agent Runtime

### Tools
- Each tool must have a clear description
- Define input schema with Zod
- Validate all inputs before execution
- Return structured results
- Handle errors gracefully
- Log tool execution for monitoring

### Workflows
- Keep workflows composable and reusable
- Each step should be idempotent when possible
- Store intermediate state
- Enable workflow resumption after failures

### Permissions
- Check permissions before tool execution
- Use principle of least privilege
- Log permission denials
- Make permission requirements explicit

## API Design

### REST Endpoints
- Use standard HTTP methods (GET, POST, PUT, DELETE)
- Return appropriate status codes
- Use consistent response format:
  ```json
  {
    "success": true,
    "data": {},
    "error": null
  }
  ```
- Validate request bodies with Zod
- Use middleware for auth, validation, error handling

### WebSocket
- Emit structured events
- Include timestamps and identifiers
- Handle reconnection gracefully
- Rate limit event emissions

## Testing

### Unit Tests
- Test pure functions and business logic
- Mock external dependencies
- Use descriptive test names
- Follow AAA pattern: Arrange, Act, Assert

### Integration Tests
- Test API endpoints
- Test database operations
- Use test database
- Clean up after tests

## Security

### Authentication
- Use HTTP-only cookies for JWT
- Validate token on every protected route
- Hash passwords with bcrypt (12 rounds)
- Never log sensitive data

### Input Validation
- Validate all user inputs
- Sanitize strings before database operations
- Use parameterized queries (Mongoose does this)
- Validate against schemas

### Secrets
- Never commit secrets to git
- Use environment variables
- Use `.env.example` for documentation
- Rotate secrets regularly in production

## Documentation

### Code Comments
- Document complex logic and algorithms
- Explain "why" not "what"
- Keep comments up to date
- Use JSDoc for public APIs

### API Documentation
- Document all endpoints
- Include example requests and responses
- Specify authentication requirements
- List possible error responses

## Git Workflow

### Commits
- Write clear, descriptive commit messages
- Use conventional commit format:
  - `feat:` new feature
  - `fix:` bug fix
  - `docs:` documentation
  - `refactor:` code refactoring
  - `test:` adding tests
  - `chore:` maintenance

### Branches
- `main` - stable production-ready code
- `develop` - integration branch for features
- `feature/*` - new features
- `fix/*` - bug fixes

## Performance

### Database
- Index frequently queried fields
- Use projection to limit returned fields
- Avoid N+1 queries
- Use aggregation pipelines for complex queries

### API
- Implement pagination for list endpoints
- Cache frequently accessed data
- Use connection pooling
- Set appropriate timeouts

### Frontend
- Code split by route
- Lazy load components
- Optimize images
- Minimize bundle size

## Monitoring and Logging

### Logging Levels
- `error` - errors that need attention
- `warn` - potential issues
- `info` - significant events
- `debug` - detailed debugging info

### What to Log
- Agent executions (start, end, status)
- Tool calls and results
- Permission checks
- Authentication events
- Errors and exceptions
- Performance metrics

### What NOT to Log
- Passwords or API keys
- Personal identifiable information (mask if necessary)
- Credit card numbers
- JWT tokens

## Deployment

### Pre-deployment Checklist
- Run type checking: `npm run type-check`
- Run linting: `npm run lint`
- Build all packages: `npm run build`
- Test critical paths
- Check environment variables
- Verify database migrations

### Environment-specific Config
- Use environment variables for config
- Never hard-code environment-specific values
- Document all required environment variables
- Use different databases for dev/staging/prod

## Kiro Usage

### Specs
- Track major features in Kiro specs
- Break down into tasks
- Update status as work progresses

### Steering Files
- Keep project conventions here
- Update as patterns emerge
- Reference in PR reviews

### Hooks
- Use hooks for repetitive tasks
- Automate linting and formatting
- Run checks before commits
