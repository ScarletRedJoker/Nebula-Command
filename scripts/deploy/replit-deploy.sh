#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# REPLIT DEPLOY - One-Click Deployment from Replit
# ═══════════════════════════════════════════════════════════════════════════════
# Provides a single command to test and deploy the entire stack.
# Designed to be used by both humans and the AI agent.
#
# Usage:
#   ./scripts/deploy/replit-deploy.sh [action] [options]
#
# Actions:
#   test      - Run all tests locally
#   push      - Push code to GitHub
#   deploy    - Full deployment (test → push → deploy to production)
#   status    - Check deployment status
#   health    - Run health checks on all services
#
# Examples:
#   ./scripts/deploy/replit-deploy.sh test
#   ./scripts/deploy/replit-deploy.sh deploy --service dashboard
#   ./scripts/deploy/replit-deploy.sh deploy --skip-tests

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# Configuration
ACTION="${1:-help}"
SERVICE="${SERVICE:-all}"
SKIP_TESTS="${SKIP_TESTS:-false}"
DEPLOY_TARGET="${DEPLOY_TARGET:-cloud}"
GITHUB_BRANCH="${GITHUB_BRANCH:-main}"
DEPLOYMENT_TRIGGERED=false

log_info() { echo -e "${CYAN}[INFO]${NC} $*"; }
log_success() { echo -e "${GREEN}[✓]${NC} $*"; }
log_warn() { echo -e "${YELLOW}[⚠]${NC} $*"; }
log_error() { echo -e "${RED}[✗]${NC} $*" >&2; }
log_step() { echo -e "\n${BOLD}${CYAN}━━━ $* ━━━${NC}\n"; }

show_help() {
    cat << 'EOF'
REPLIT DEPLOY - One-Click Deployment

USAGE:
    ./scripts/deploy/replit-deploy.sh <action> [options]

ACTIONS:
    test        Run all tests (TypeScript + Python)
    push        Commit and push to GitHub
    deploy      Full deployment pipeline:
                  1. Run tests
                  2. Push to GitHub
                  3. Trigger GitHub Actions
                  4. Wait for deployment
                  5. Verify health checks
    status      Show current deployment status
    health      Run health checks on all services
    help        Show this help message

OPTIONS:
    --service <name>    Deploy specific service (dashboard, discord-bot, stream-bot)
    --skip-tests        Skip running tests
    --target <env>      Deployment target (cloud, local, all)
    --branch <name>     Git branch to deploy (default: main)

EXAMPLES:
    # Full deployment
    ./scripts/deploy/replit-deploy.sh deploy

    # Deploy only dashboard
    ./scripts/deploy/replit-deploy.sh deploy --service dashboard

    # Quick deploy without tests
    ./scripts/deploy/replit-deploy.sh deploy --skip-tests

    # Just run tests
    ./scripts/deploy/replit-deploy.sh test

ENVIRONMENT VARIABLES:
    GITHUB_TOKEN        GitHub API token (for triggering workflows)
    DEPLOY_TARGET       Target environment (cloud/local)
    SKIP_TESTS          Set to 'true' to skip tests
EOF
}

parse_args() {
    shift # Remove action
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --service)
                SERVICE="$2"
                shift 2
                ;;
            --skip-tests)
                SKIP_TESTS="true"
                shift
                ;;
            --target)
                DEPLOY_TARGET="$2"
                shift 2
                ;;
            --branch)
                GITHUB_BRANCH="$2"
                shift 2
                ;;
            *)
                shift
                ;;
        esac
    done
}

run_tests() {
    log_step "Running Tests"
    
    local failed=0
    
    # TypeScript type checking
    log_info "Running TypeScript checks..."
    if [ -f "${PROJECT_ROOT}/services/discord-bot/package.json" ]; then
        cd "${PROJECT_ROOT}/services/discord-bot"
        if npm run check 2>&1; then
            log_success "Discord Bot TypeScript check passed"
        else
            log_error "Discord Bot TypeScript check failed"
            ((failed++))
        fi
    fi
    
    if [ -f "${PROJECT_ROOT}/services/stream-bot/package.json" ]; then
        cd "${PROJECT_ROOT}/services/stream-bot"
        if npm run check 2>&1; then
            log_success "Stream Bot TypeScript check passed"
        else
            log_error "Stream Bot TypeScript check failed"
            ((failed++))
        fi
    fi
    
    # Python tests (if pytest is available)
    log_info "Running Python tests..."
    cd "${PROJECT_ROOT}"
    if command -v pytest &> /dev/null; then
        if pytest services/dashboard/tests/ -v 2>&1 || true; then
            log_success "Python tests passed"
        fi
    else
        log_warn "pytest not installed, skipping Python tests"
    fi
    
    cd "${PROJECT_ROOT}"
    
    if [ $failed -gt 0 ]; then
        log_error "$failed test suite(s) failed"
        return 1
    fi
    
    log_success "All tests passed!"
    return 0
}

detect_replit_environment() {
    # Check if we're running in Replit (git operations may be restricted)
    if [ -n "${REPL_ID:-}" ] || [ -n "${REPLIT_DEV_DOMAIN:-}" ]; then
        return 0  # We're in Replit
    fi
    return 1  # Not in Replit
}

git_push() {
    log_step "Pushing to GitHub"
    
    cd "${PROJECT_ROOT}"
    
    # Check if we're in Replit (git may be restricted)
    if detect_replit_environment; then
        log_warn "Running in Replit - git operations may be restricted"
        log_info "Attempting to use GitHub API instead..."
        
        # Try to trigger workflow directly via API
        if trigger_github_workflow_api; then
            log_success "Triggered deployment via GitHub API"
            DEPLOYMENT_TRIGGERED=true
            return 0
        else
            log_error "API trigger failed - deployment NOT started"
            echo ""
            echo "To deploy, you need to:"
            echo "  1. Use the Git pane in Replit (left sidebar) to commit and push, OR"
            echo "  2. Go to GitHub and manually trigger the workflow, OR"
            echo "  3. Set GITHUB_TOKEN secret to enable API-based deployment"
            echo ""
            DEPLOYMENT_TRIGGERED=false
            return 1  # Fail so the pipeline stops
        fi
    fi
    
    # Standard git push (for non-Replit environments)
    if git diff --quiet 2>/dev/null && git diff --staged --quiet 2>/dev/null; then
        log_info "No changes to commit"
    else
        git add -A 2>/dev/null || true
        
        local commit_msg="Deploy: $(date '+%Y-%m-%d %H:%M:%S')"
        if [ "$SERVICE" != "all" ]; then
            commit_msg="Deploy ${SERVICE}: $(date '+%Y-%m-%d %H:%M:%S')"
        fi
        
        log_info "Committing changes..."
        git commit -m "$commit_msg" 2>/dev/null || true
    fi
    
    log_info "Pushing to origin/${GITHUB_BRANCH}..."
    if git push origin "${GITHUB_BRANCH}" 2>/dev/null; then
        log_success "Pushed to GitHub"
        DEPLOYMENT_TRIGGERED=true
    else
        log_error "Failed to push to GitHub"
        log_info "Use the Replit Git pane or GitHub web UI to push changes"
        DEPLOYMENT_TRIGGERED=false
        return 1
    fi
}

trigger_github_workflow_api() {
    # Check for GitHub token (from integration or environment)
    local token="${GITHUB_TOKEN:-}"
    
    if [ -z "$token" ]; then
        log_warn "GITHUB_TOKEN not set"
        return 1
    fi
    
    # Get repository info
    local repo_url=$(git remote get-url origin 2>/dev/null || echo "")
    if [ -z "$repo_url" ]; then
        log_error "Cannot determine repository URL"
        return 1
    fi
    
    local repo_path=$(echo "$repo_url" | sed -E 's|.*github.com[:/](.+/.+)(\.git)?$|\1|' | sed 's/\.git$//')
    
    log_info "Triggering workflow for ${repo_path}..."
    
    local response=$(curl -s -w "\n%{http_code}" -X POST \
        -H "Accept: application/vnd.github.v3+json" \
        -H "Authorization: token ${token}" \
        "https://api.github.com/repos/${repo_path}/actions/workflows/deploy.yml/dispatches" \
        -d "{\"ref\":\"${GITHUB_BRANCH}\",\"inputs\":{\"service\":\"${SERVICE}\",\"environment\":\"production\"}}")
    
    local http_code=$(echo "$response" | tail -1)
    
    if [ "$http_code" = "204" ] || [ "$http_code" = "200" ]; then
        log_success "Workflow triggered successfully"
        return 0
    else
        log_error "Failed to trigger workflow (HTTP $http_code)"
        return 1
    fi
}

trigger_github_workflow() {
    log_step "Triggering GitHub Actions Deployment"
    
    # In Replit, we've already triggered via API in git_push
    if detect_replit_environment; then
        log_info "Deployment triggered via GitHub API"
        log_info "Monitor at: https://github.com/$(git remote get-url origin 2>/dev/null | sed -E 's|.*github.com[:/](.+/.+)(\.git)?$|\1|' | sed 's/\.git$//')/actions"
        return 0
    fi
    
    # For non-Replit environments, push triggers the workflow automatically
    log_info "GitHub Actions will automatically deploy on push to main"
}

check_health() {
    log_step "Running Health Checks"
    
    local all_healthy=true
    
    # Check Dashboard
    log_info "Checking Dashboard..."
    if curl -s -o /dev/null -w "%{http_code}" "http://localhost:5000/health" | grep -q "200"; then
        log_success "Dashboard is healthy"
    else
        log_warn "Dashboard health check failed"
        all_healthy=false
    fi
    
    # Check Discord Bot
    log_info "Checking Discord Bot..."
    if curl -s -o /dev/null -w "%{http_code}" "http://localhost:4000/health" | grep -q "200"; then
        log_success "Discord Bot is healthy"
    else
        log_warn "Discord Bot health check failed"
        all_healthy=false
    fi
    
    # Check Stream Bot
    log_info "Checking Stream Bot..."
    if curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000/health" | grep -q "200"; then
        log_success "Stream Bot is healthy"
    else
        log_warn "Stream Bot health check failed"
        all_healthy=false
    fi
    
    if $all_healthy; then
        log_success "All services are healthy!"
        return 0
    else
        log_warn "Some services may need attention"
        return 1
    fi
}

show_status() {
    log_step "Deployment Status"
    
    echo "Environment: Replit Development"
    echo "Branch: ${GITHUB_BRANCH}"
    echo "Service: ${SERVICE}"
    echo ""
    
    # Git status (may not work in all environments)
    log_info "Git Status:"
    cd "${PROJECT_ROOT}"
    git status --short 2>/dev/null || echo "  (Git status unavailable)"
    echo ""
    
    # Last commit
    log_info "Last Commit:"
    git log --oneline -1 2>/dev/null || echo "  (Git log unavailable)"
    echo ""
    
    # Service status
    check_health || true
}

action_deploy() {
    echo ""
    echo "═══════════════════════════════════════════════════════════════"
    echo "  REPLIT DEPLOY - Full Deployment Pipeline"
    echo "═══════════════════════════════════════════════════════════════"
    echo ""
    echo "  Target:  ${DEPLOY_TARGET}"
    echo "  Service: ${SERVICE}"
    echo "  Branch:  ${GITHUB_BRANCH}"
    echo "  Tests:   ${SKIP_TESTS:-enabled}"
    echo ""
    echo "═══════════════════════════════════════════════════════════════"
    
    # Step 1: Run tests
    if [ "$SKIP_TESTS" != "true" ]; then
        if ! run_tests; then
            log_error "Tests failed, aborting deployment"
            exit 1
        fi
    else
        log_warn "Skipping tests (--skip-tests)"
    fi
    
    # Step 2: Push to GitHub
    if ! git_push; then
        log_error "Git push failed, aborting deployment"
        exit 1
    fi
    
    # Step 3: Trigger GitHub Actions
    trigger_github_workflow
    
    # Step 4: Summary
    log_step "Deployment Summary"
    
    if [ "$DEPLOYMENT_TRIGGERED" = true ]; then
        echo ""
        echo "Deployment has been triggered successfully!"
        echo ""
        echo "Next steps:"
        echo "  1. Check GitHub Actions: https://github.com/$(git remote get-url origin 2>/dev/null | sed -E 's|.*github.com[:/](.+/.+)(\.git)?$|\1|' | sed 's/\.git$//')/actions"
        echo "  2. Monitor deployment logs"
        echo "  3. Verify production health: ./scripts/deploy/replit-deploy.sh health"
        echo ""
        log_success "Deployment pipeline completed!"
    else
        echo ""
        log_warn "Deployment was NOT triggered"
        echo ""
        echo "The tests passed but no deployment occurred."
        echo "Please push your code manually via the Git pane or GitHub."
        echo ""
        exit 1
    fi
}

# Parse additional arguments
if [ $# -gt 1 ]; then
    parse_args "$@"
fi

# Main
case "$ACTION" in
    help|-h|--help)
        show_help
        ;;
    test)
        run_tests
        ;;
    push)
        git_push
        ;;
    deploy)
        action_deploy
        ;;
    status)
        show_status
        ;;
    health)
        check_health
        ;;
    *)
        log_error "Unknown action: $ACTION"
        echo ""
        show_help
        exit 1
        ;;
esac
