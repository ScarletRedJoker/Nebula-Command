# Replit Validation & Testing Infrastructure

## 🎯 Purpose

This validation system catches deployment failures **before** they reach Ubuntu, eliminating costly deployment errors and rollbacks.

## 📁 System Components

### Validation Scripts (`scripts/validation/`)

1. **check_lsp.py** - LSP Diagnostics Checker
   - Validates Python code with Pyright
   - Validates TypeScript code with tsc
   - Catches type errors, syntax issues, import problems

2. **check_packages.py** - Package Manifest Validator
   - Validates all package.json files
   - Validates all requirements.txt files
   - Ensures no syntax errors in dependency files

3. **docker_simulate.py** - Dockerfile Validator
   - Parses Dockerfiles for syntax errors
   - Validates COPY sources exist
   - Checks for required FROM instructions

### Orchestration Scripts

- **validate-for-ubuntu.sh** - Main validation orchestrator
- **setup-replit-dev.sh** - One-time setup script

### Development Tools

- **cli/replit_dev_console.py** - Interactive development menu
- **.githooks/pre-push** - Automatic validation on git push

## 🚀 Quick Start

### Initial Setup (Run Once)

```bash
bash scripts/setup-replit-dev.sh
```

This will:
- Make all scripts executable
- Configure git hooks
- Set up the validation pipeline

### Running Validation

**Option 1: Command Line**
```bash
./scripts/validate-for-ubuntu.sh
```

**Option 2: Interactive Console**
```bash
python3 cli/replit_dev_console.py
```

**Option 3: Automatic (Git Hook)**
Validation runs automatically when you push:
```bash
git push
# Validation runs automatically
```

## 📋 Validation Stages

### Stage 1: LSP Diagnostics
- **What it checks**: Type errors, syntax errors, import issues
- **Tools used**: Pyright (Python), tsc (TypeScript)
- **Services checked**: dashboard, stream-bot, discord-bot

### Stage 2: Package Manifests
- **What it checks**: Valid JSON, required fields, package syntax
- **Files checked**: All package.json and requirements.txt files
- **Excludes**: node_modules directory

### Stage 3: Docker Build Simulation
- **What it checks**: Dockerfile syntax, COPY sources, FROM instructions
- **Files checked**: All Dockerfiles in the project
- **Excludes**: node_modules, .git directories

## 🔧 Fixing Common Errors

### Python LSP Errors

**Error**: Type errors or import issues
```bash
# Check specific errors
python3 scripts/validation/check_lsp.py
```

**Fix**:
1. Read the error message carefully
2. Fix type annotations or imports
3. Run validation again

### TypeScript LSP Errors

**Error**: TypeScript compilation errors
```bash
# Check TypeScript errors
cd services/stream-bot
npx tsc --noEmit
```

**Fix**:
1. Review TypeScript errors
2. Fix type definitions or syntax
3. Run validation again

### Package Manifest Errors

**Error**: Invalid JSON or missing fields

**Fix**:
1. Validate JSON syntax (use JSON linter)
2. Ensure required fields: name, version, dependencies
3. Check for typos in package names

### Dockerfile Errors

**Error**: Missing sources or invalid syntax

**Fix**:
1. Ensure COPY sources exist
2. Add FROM instruction if missing
3. Validate Dockerfile syntax

## 🎮 Interactive Console Features

```
╔═══════════════════════════════════════════╗
║  🚀 REPLIT DEVELOPMENT CONSOLE           ║
╠═══════════════════════════════════════════╣
║  1) ✅ Validate for Ubuntu Deploy         ║
║  2) 🔍 Check LSP Diagnostics              ║
║  3) 📦 Check Package Manifests            ║
║  4) 🐳 Simulate Docker Builds             ║
║  5) 🧪 Run All Tests                      ║
║  6) 📊 View Dashboard Logs                ║
║  7) 🤖 View Stream Bot Logs               ║
║  0) 🚪 Exit                               ║
╚═══════════════════════════════════════════╝
```

### Menu Options Explained

1. **Validate for Ubuntu Deploy** - Run full validation suite
2. **Check LSP Diagnostics** - Python & TypeScript type checking
3. **Check Package Manifests** - Validate dependency files
4. **Simulate Docker Builds** - Check Dockerfiles
5. **Run All Tests** - Execute pytest test suite
6. **View Dashboard Logs** - Tail dashboard service logs
7. **View Stream Bot Logs** - Tail stream-bot service logs

## 🔐 Git Hook Behavior

The pre-push hook automatically runs validation before every push:

**Success**: Push proceeds normally
```bash
🔒 Running pre-push validation...
✅ ALL VALIDATION CHECKS PASSED!
✅ Validation passed - proceeding with push
```

**Failure**: Push is blocked
```bash
🔒 Running pre-push validation...
❌ VALIDATION FAILED
❌ Validation failed - push blocked
Fix errors and try again, or use 'git push --no-verify' to bypass
```

**Bypass** (use sparingly):
```bash
git push --no-verify
```

## 📊 Success Indicators

### All Checks Passed
```
╔════════════════════════════════════════════════════════════╗
║  🧪 REPLIT PRE-DEPLOYMENT VALIDATOR                       ║
║  Catch deployment failures BEFORE Ubuntu                  ║
╚════════════════════════════════════════════════════════════╝

━━━ Stage 1: LSP Diagnostics ━━━
🔍 Checking Python LSP diagnostics...
✅ Python LSP check passed
🔍 Checking TypeScript LSP diagnostics...
✅ TypeScript LSP check passed
✅ LSP checks passed

━━━ Stage 2: Package Manifests ━━━
📦 Checking package manifests...
✅ All package manifests valid!
✅ Package validation passed

━━━ Stage 3: Docker Build Simulation ━━━
🐳 Simulating Docker builds...
✅ All Dockerfiles valid!
✅ Docker simulation passed

═══════════════════════════════════════════════════════════
✅ ALL VALIDATION CHECKS PASSED!
   Safe to deploy to Ubuntu
```

## 🛠️ Troubleshooting

### Validation Script Not Found
```bash
# Re-run setup
bash scripts/setup-replit-dev.sh
```

### Permission Denied
```bash
# Make scripts executable
chmod +x scripts/validate-for-ubuntu.sh
chmod +x scripts/validation/*.py
chmod +x cli/replit_dev_console.py
```

### Git Hook Not Working
```bash
# Re-configure git hooks
git config core.hooksPath .githooks
chmod +x .githooks/pre-push
```

## 📈 Best Practices

1. **Run Before Every Deploy**
   - Always run validation before deploying to Ubuntu
   - Use the interactive console for iterative development

2. **Fix Errors Immediately**
   - Don't accumulate validation errors
   - Fix issues as they appear

3. **Use Git Hooks**
   - Let automatic validation catch errors early
   - Don't bypass unless absolutely necessary

4. **Check Logs Regularly**
   - Use the console to monitor service logs
   - Identify issues before they become problems

## 🔄 Workflow Integration

### Development Workflow
1. Make code changes
2. Run validation: `./scripts/validate-for-ubuntu.sh`
3. Fix any errors
4. Commit changes
5. Push (automatic validation runs)
6. Deploy to Ubuntu with confidence

### Pre-Deployment Checklist
- [ ] LSP diagnostics pass
- [ ] Package manifests valid
- [ ] Dockerfiles validate
- [ ] Tests pass
- [ ] Logs show no errors

## 📞 Support

### Quick Reference
- Main validation: `./scripts/validate-for-ubuntu.sh`
- Interactive console: `python3 cli/replit_dev_console.py`
- LSP only: `python3 scripts/validation/check_lsp.py`
- Packages only: `python3 scripts/validation/check_packages.py`
- Docker only: `python3 scripts/validation/docker_simulate.py`

### Common Commands
```bash
# Full setup
bash scripts/setup-replit-dev.sh

# Run validation
./scripts/validate-for-ubuntu.sh

# Interactive mode
python3 cli/replit_dev_console.py

# Bypass git hook (emergency only)
git push --no-verify
```

## 🎯 Success Metrics

This validation system helps you:
- ✅ Catch errors before deployment
- ✅ Reduce deployment failures
- ✅ Save time on rollbacks
- ✅ Increase deployment confidence
- ✅ Maintain code quality

---

**Remember**: The best deployments are the ones that never fail. This validation system helps you deploy with confidence! 🚀
