#!/bin/bash

echo "🤖 Continuous Testing System (Fixed)"
echo "======================================"

check_dependencies() {
    echo "Checking dependencies..."
    
    if ! command -v python3 &> /dev/null; then
        echo "❌ Python3 not found"
        exit 1
    fi
    
    if ! python3 -m pytest --version &> /dev/null; then
        echo "❌ pytest not installed - installing..."
        pip install pytest
    fi
    
    if ! command -v npm &> /dev/null; then
        echo "❌ npm not found"
        exit 1
    fi
    
    echo "✅ All dependencies OK"
}

run_tests_with_timeout() {
    local service=$1
    local test_cmd=$2
    local timeout=300
    
    echo "Testing $service (timeout: ${timeout}s)..."
    
    timeout $timeout bash -c "$test_cmd"
    return $?
}

run_test_cycle() {
    local passed=0
    local failed=0
    
    echo ""
    echo "[$(date)] Running test cycle..."
    echo ""
    
    if run_tests_with_timeout "Dashboard" "cd services/dashboard && python3 -m pytest tests/ -v --tb=short"; then
        echo "✅ Dashboard tests PASSED"
        ((passed++))
    else
        echo "❌ Dashboard tests FAILED"
        ((failed++))
    fi
    
    echo ""
    echo "======================================"
    echo "Results: $passed passed, $failed failed"
    echo "======================================"
    
    return $failed
}

check_dependencies

if [ "$1" == "--once" ]; then
    run_test_cycle
    exit $?
else
    while true; do
        run_test_cycle
        echo ""
        echo "Waiting 5 minutes..."
        sleep 300
    done
fi
