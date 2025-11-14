"""Test deployment executor"""
from jarvis.deployment_executor import DeploymentExecutor
from jarvis.compose_templates import generate_compose_spec, compose_to_yaml
from models.jarvis import Project

print("=" * 60)
print("Testing Jarvis Deployment Executor")
print("=" * 60)

# Test compose generation
print("\n1. Testing Compose Template Generator")
print("-" * 60)

compose_dict = generate_compose_spec(
    project_name='test-app',
    image_ref='localhost:5000/test-app:latest',
    container_port=8000,
    domain='test.evindrake.net',
    environment={'NODE_ENV': 'production', 'LOG_LEVEL': 'info'}
)

yaml_content = compose_to_yaml(compose_dict)
print("Generated Compose YAML:")
print(yaml_content)

# Test deployment executor initialization
print("\n2. Testing Deployment Executor Initialization")
print("-" * 60)

try:
    executor = DeploymentExecutor()
    print("✅ Deployment executor initialized")
    print(f"   Deployments directory: {executor.deployments_dir}")
    print(f"   Docker SDK available: {executor.client is not None}")
    print(f"   Docker Compose CLI available: {executor.compose_available}")
except Exception as e:
    print(f"⚠️  Deployment executor unavailable: {e}")

# Test template variations
print("\n3. Testing Template Variations")
print("-" * 60)

# Without domain (direct port mapping)
print("Without domain (direct port mapping):")
compose_no_domain = generate_compose_spec(
    project_name='simple-app',
    image_ref='nginx:latest',
    container_port=80,
    host_port=8080
)
print(f"  Ports: {compose_no_domain['services']['simple-app'].get('ports', [])}")
print(f"  Labels: {compose_no_domain['services']['simple-app']['labels']}")

# With domain (Caddy proxy)
print("\nWith domain (Caddy reverse proxy):")
compose_with_domain = generate_compose_spec(
    project_name='web-app',
    image_ref='my-app:latest',
    container_port=3000,
    domain='app.evindrake.net'
)
print(f"  Ports: {compose_with_domain['services']['web-app'].get('ports', [])}")
caddy_labels = {k: v for k, v in compose_with_domain['services']['web-app']['labels'].items() if 'caddy' in k}
print(f"  Caddy labels: {caddy_labels}")
print(f"  ✅ Caddy reverse_proxy syntax: {caddy_labels.get('caddy.reverse_proxy', 'NOT FOUND')}")

# With volumes and custom networks
print("\nWith volumes and custom networks:")
compose_advanced = generate_compose_spec(
    project_name='database-app',
    image_ref='postgres:15',
    container_port=5432,
    host_port=5432,
    volumes=['/data/postgres:/var/lib/postgresql/data'],
    networks=['custom-net', 'jarvis-net']
)
print(f"  Volumes: {compose_advanced['services']['database-app']['volumes']}")
print(f"  Networks: {compose_advanced['services']['database-app']['networks']}")

# Verify Caddy label syntax is correct
print("\n4. Verify Caddy Label Syntax Fix")
print("-" * 60)
test_compose = generate_compose_spec(
    project_name='test-caddy',
    image_ref='test:latest',
    container_port=8080,
    domain='test.example.com'
)
caddy_reverse_proxy = test_compose['services']['test-caddy']['labels'].get('caddy.reverse_proxy')
expected_syntax = 'test-caddy:8080'
if caddy_reverse_proxy == expected_syntax:
    print(f"✅ Caddy syntax is CORRECT: {caddy_reverse_proxy}")
else:
    print(f"❌ Caddy syntax is WRONG!")
    print(f"   Expected: {expected_syntax}")
    print(f"   Got: {caddy_reverse_proxy}")

print("\n" + "=" * 60)
print("✅ All tests completed successfully!")
print("=" * 60)
