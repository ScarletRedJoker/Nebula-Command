#!/bin/bash
set -e

echo "╔════════════════════════════════════════════════════════════╗"
echo "║  🧪 REPLIT PRE-DEPLOYMENT VALIDATOR                       ║"
echo "║  Catch deployment failures BEFORE Ubuntu                  ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

FAILED=0

# Stage 1: LSP Diagnostics
echo "━━━ Stage 1: LSP Diagnostics ━━━"
if python3 scripts/validation/check_lsp.py; then
    echo "✅ LSP checks passed"
else
    echo "❌ LSP checks failed"
    FAILED=1
fi
echo ""

# Stage 2: Package Manifests
echo "━━━ Stage 2: Package Manifests ━━━"
if python3 scripts/validation/check_packages.py; then
    echo "✅ Package validation passed"
else
    echo "❌ Package validation failed"
    FAILED=1
fi
echo ""

# Stage 3: Docker Simulation
echo "━━━ Stage 3: Docker Build Simulation ━━━"
if python3 scripts/validation/docker_simulate.py; then
    echo "✅ Docker simulation passed"
else
    echo "❌ Docker simulation failed"
    FAILED=1
fi
echo ""

# Summary
echo "═══════════════════════════════════════════════════════════"
if [ $FAILED -eq 0 ]; then
    echo "✅ ALL VALIDATION CHECKS PASSED!"
    echo "   Safe to deploy to Ubuntu"
    exit 0
else
    echo "❌ VALIDATION FAILED"
    echo "   Fix errors before deploying to Ubuntu"
    exit 1
fi
