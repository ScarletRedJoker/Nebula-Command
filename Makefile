# HomeLabHub Makefile
# Configuration management and common tasks

.PHONY: help config validate encrypt-secrets clean-configs install-deps test

# Default target
help:
	@echo "HomeLabHub Makefile"
	@echo ""
	@echo "Configuration Management:"
	@echo "  make config ENV=<env> HOST=<host>  - Generate configs for environment"
	@echo "  make validate ENV=<env> HOST=<host> - Validate generated configs"
	@echo "  make encrypt-secrets                - Encrypt unencrypted secret files"
	@echo "  make clean-configs                  - Remove all generated configs"
	@echo ""
	@echo "Development:"
	@echo "  make install-deps                   - Install Python dependencies"
	@echo "  make test                           - Run validation tests"
	@echo ""
	@echo "Examples:"
	@echo "  make config ENV=dev HOST=localhost"
	@echo "  make config ENV=prod HOST=evindrake.net"
	@echo "  make validate ENV=prod HOST=evindrake.net"

# Configuration generation
config:
	@if [ -z "$(ENV)" ] || [ -z "$(HOST)" ]; then \
		echo "Error: ENV and HOST required"; \
		echo "Usage: make config ENV=<env> HOST=<host>"; \
		echo "Example: make config ENV=dev HOST=localhost"; \
		exit 1; \
	fi
	@echo "Generating configuration for $(ENV) environment on $(HOST)..."
	python3 config/scripts/generate-config.py --env $(ENV) --host $(HOST)

# Validation
validate:
	@if [ -z "$(ENV)" ] || [ -z "$(HOST)" ]; then \
		echo "Error: ENV and HOST required"; \
		echo "Usage: make validate ENV=<env> HOST=<host>"; \
		exit 1; \
	fi
	python3 config/scripts/validate-config.py --env $(ENV) --host $(HOST)

# Encrypt secrets
encrypt-secrets:
	@echo "Encrypting secrets with SOPS..."
	./config/scripts/encrypt-secrets.sh

# Clean generated configs
clean-configs:
	@echo "Removing generated configs..."
	rm -rf deployment/dev deployment/staging deployment/prod
	@echo "✓ Configs cleaned"

# Install Python dependencies
install-deps:
	@echo "Installing Python dependencies..."
	pip install -q pyyaml jinja2 pydantic
	@echo "✓ Dependencies installed"

# Test configuration system
test: install-deps
	@echo "Testing configuration system..."
	@# Test that age and sops are available
	@which age > /dev/null || (echo "Error: age not installed" && exit 1)
	@which sops > /dev/null || (echo "Error: sops not installed" && exit 1)
	@# Test that age key exists
	@test -f config/keys/age-key.txt || (echo "Error: Age key not found" && exit 1)
	@# Test that base secrets exist
	@test -f config/secrets/base.enc.yaml || (echo "Error: base.enc.yaml not found - run 'make encrypt-secrets'" && exit 1)
	@echo "✓ All tests passed"

# Development shortcuts
dev:
	make config ENV=dev HOST=localhost

prod-evindrake:
	make config ENV=prod HOST=evindrake.net

prod-rigcity:
	make config ENV=prod HOST=rig-city.com
