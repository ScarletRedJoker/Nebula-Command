"""
Stack Templates for Infrastructure Automation
Pre-configured templates for common application stacks and services
"""

from typing import Dict, List, Optional, Any

STACK_TEMPLATES: Dict[str, Dict[str, Any]] = {
    "wordpress": {
        "name": "WordPress with MySQL",
        "description": "Full WordPress installation with MySQL database and optional SSL",
        "category": "cms",
        "complexity": "simple",
        "estimated_resources": {
            "cpu_cores": 2,
            "memory_gb": 2,
            "storage_gb": 20
        },
        "services": {
            "wordpress": {
                "image": "wordpress:latest",
                "container_name": "{project_name}-wordpress",
                "restart": "unless-stopped",
                "environment": {
                    "WORDPRESS_DB_HOST": "{project_name}-mysql:3306",
                    "WORDPRESS_DB_USER": "{db_user}",
                    "WORDPRESS_DB_PASSWORD": "{db_password}",
                    "WORDPRESS_DB_NAME": "{db_name}"
                },
                "volumes": [
                    "{project_name}_wp_data:/var/www/html"
                ],
                "depends_on": ["mysql"],
                "ports": ["{port}:80"],
                "networks": ["web", "internal"]
            },
            "mysql": {
                "image": "mysql:8.0",
                "container_name": "{project_name}-mysql",
                "restart": "unless-stopped",
                "environment": {
                    "MYSQL_ROOT_PASSWORD": "{db_root_password}",
                    "MYSQL_DATABASE": "{db_name}",
                    "MYSQL_USER": "{db_user}",
                    "MYSQL_PASSWORD": "{db_password}"
                },
                "volumes": [
                    "{project_name}_mysql_data:/var/lib/mysql"
                ],
                "networks": ["internal"]
            }
        },
        "volumes": {
            "{project_name}_wp_data": {},
            "{project_name}_mysql_data": {}
        },
        "networks": {
            "web": {"external": True, "name": "homelab"},
            "internal": {"driver": "bridge"}
        },
        "required_vars": ["project_name", "port", "db_user", "db_password", "db_name", "db_root_password"],
        "optional_vars": ["domain"],
        "default_port": 8080,
        "caddy_config": {
            "enabled": True,
            "upstream_port": 80
        }
    },
    
    "lamp_stack": {
        "name": "LAMP Stack (Linux, Apache, MySQL, PHP)",
        "description": "Classic LAMP stack for PHP applications",
        "category": "web",
        "complexity": "simple",
        "estimated_resources": {
            "cpu_cores": 2,
            "memory_gb": 2,
            "storage_gb": 10
        },
        "services": {
            "apache": {
                "image": "php:8.2-apache",
                "container_name": "{project_name}-apache",
                "restart": "unless-stopped",
                "volumes": [
                    "{project_name}_www:/var/www/html"
                ],
                "environment": {
                    "APACHE_DOCUMENT_ROOT": "/var/www/html"
                },
                "ports": ["{port}:80"],
                "depends_on": ["mysql"],
                "networks": ["web", "internal"]
            },
            "mysql": {
                "image": "mysql:8.0",
                "container_name": "{project_name}-mysql",
                "restart": "unless-stopped",
                "environment": {
                    "MYSQL_ROOT_PASSWORD": "{db_root_password}",
                    "MYSQL_DATABASE": "{db_name}",
                    "MYSQL_USER": "{db_user}",
                    "MYSQL_PASSWORD": "{db_password}"
                },
                "volumes": [
                    "{project_name}_mysql_data:/var/lib/mysql"
                ],
                "networks": ["internal"]
            },
            "phpmyadmin": {
                "image": "phpmyadmin:latest",
                "container_name": "{project_name}-phpmyadmin",
                "restart": "unless-stopped",
                "environment": {
                    "PMA_HOST": "{project_name}-mysql",
                    "PMA_USER": "root",
                    "PMA_PASSWORD": "{db_root_password}"
                },
                "ports": ["{admin_port}:80"],
                "depends_on": ["mysql"],
                "networks": ["web", "internal"]
            }
        },
        "volumes": {
            "{project_name}_www": {},
            "{project_name}_mysql_data": {}
        },
        "networks": {
            "web": {"external": True, "name": "homelab"},
            "internal": {"driver": "bridge"}
        },
        "required_vars": ["project_name", "port", "admin_port", "db_user", "db_password", "db_name", "db_root_password"],
        "optional_vars": ["domain"],
        "default_port": 8080
    },
    
    "mean_stack": {
        "name": "MEAN Stack (MongoDB, Express, Angular, Node.js)",
        "description": "Full JavaScript stack with MongoDB and Angular frontend",
        "category": "web",
        "complexity": "medium",
        "estimated_resources": {
            "cpu_cores": 4,
            "memory_gb": 4,
            "storage_gb": 20
        },
        "services": {
            "mongodb": {
                "image": "mongo:7",
                "container_name": "{project_name}-mongodb",
                "restart": "unless-stopped",
                "environment": {
                    "MONGO_INITDB_ROOT_USERNAME": "{mongo_user}",
                    "MONGO_INITDB_ROOT_PASSWORD": "{mongo_password}",
                    "MONGO_INITDB_DATABASE": "{db_name}"
                },
                "volumes": [
                    "{project_name}_mongo_data:/data/db"
                ],
                "networks": ["internal"]
            },
            "backend": {
                "build": {
                    "context": "./backend",
                    "dockerfile": "Dockerfile"
                },
                "container_name": "{project_name}-backend",
                "restart": "unless-stopped",
                "environment": {
                    "MONGODB_URI": "mongodb://{mongo_user}:{mongo_password}@{project_name}-mongodb:27017/{db_name}?authSource=admin",
                    "NODE_ENV": "production",
                    "PORT": "3000"
                },
                "depends_on": ["mongodb"],
                "ports": ["{api_port}:3000"],
                "networks": ["web", "internal"]
            },
            "frontend": {
                "build": {
                    "context": "./frontend",
                    "dockerfile": "Dockerfile"
                },
                "container_name": "{project_name}-frontend",
                "restart": "unless-stopped",
                "environment": {
                    "API_URL": "http://{project_name}-backend:3000"
                },
                "depends_on": ["backend"],
                "ports": ["{port}:80"],
                "networks": ["web"]
            }
        },
        "volumes": {
            "{project_name}_mongo_data": {}
        },
        "networks": {
            "web": {"external": True, "name": "homelab"},
            "internal": {"driver": "bridge"}
        },
        "required_vars": ["project_name", "port", "api_port", "mongo_user", "mongo_password", "db_name"],
        "optional_vars": ["domain"],
        "default_port": 4200
    },
    
    "django": {
        "name": "Django with PostgreSQL",
        "description": "Production-ready Django application with PostgreSQL, Redis cache, and Celery",
        "category": "web",
        "complexity": "medium",
        "estimated_resources": {
            "cpu_cores": 2,
            "memory_gb": 2,
            "storage_gb": 10
        },
        "services": {
            "web": {
                "build": {
                    "context": ".",
                    "dockerfile": "Dockerfile"
                },
                "container_name": "{project_name}-django",
                "restart": "unless-stopped",
                "environment": {
                    "DATABASE_URL": "postgres://{db_user}:{db_password}@{project_name}-postgres:5432/{db_name}",
                    "REDIS_URL": "redis://{project_name}-redis:6379/0",
                    "SECRET_KEY": "{secret_key}",
                    "DEBUG": "False",
                    "ALLOWED_HOSTS": "{allowed_hosts}"
                },
                "volumes": [
                    "{project_name}_static:/app/staticfiles",
                    "{project_name}_media:/app/media"
                ],
                "depends_on": ["postgres", "redis"],
                "ports": ["{port}:8000"],
                "networks": ["web", "internal"],
                "command": "gunicorn --bind 0.0.0.0:8000 --reuse-port --workers 4 {app_module}.wsgi:application"
            },
            "postgres": {
                "image": "postgres:15",
                "container_name": "{project_name}-postgres",
                "restart": "unless-stopped",
                "environment": {
                    "POSTGRES_USER": "{db_user}",
                    "POSTGRES_PASSWORD": "{db_password}",
                    "POSTGRES_DB": "{db_name}"
                },
                "volumes": [
                    "{project_name}_postgres_data:/var/lib/postgresql/data"
                ],
                "networks": ["internal"]
            },
            "redis": {
                "image": "redis:7-alpine",
                "container_name": "{project_name}-redis",
                "restart": "unless-stopped",
                "volumes": [
                    "{project_name}_redis_data:/data"
                ],
                "networks": ["internal"]
            },
            "celery": {
                "build": {
                    "context": ".",
                    "dockerfile": "Dockerfile"
                },
                "container_name": "{project_name}-celery",
                "restart": "unless-stopped",
                "environment": {
                    "DATABASE_URL": "postgres://{db_user}:{db_password}@{project_name}-postgres:5432/{db_name}",
                    "REDIS_URL": "redis://{project_name}-redis:6379/0",
                    "SECRET_KEY": "{secret_key}"
                },
                "depends_on": ["postgres", "redis"],
                "networks": ["internal"],
                "command": "celery -A {app_module} worker -l info"
            }
        },
        "volumes": {
            "{project_name}_static": {},
            "{project_name}_media": {},
            "{project_name}_postgres_data": {},
            "{project_name}_redis_data": {}
        },
        "networks": {
            "web": {"external": True, "name": "homelab"},
            "internal": {"driver": "bridge"}
        },
        "required_vars": ["project_name", "port", "db_user", "db_password", "db_name", "secret_key", "allowed_hosts", "app_module"],
        "optional_vars": ["domain"],
        "default_port": 8000
    },
    
    "flask": {
        "name": "Flask with PostgreSQL",
        "description": "Production Flask application with PostgreSQL and Redis",
        "category": "web",
        "complexity": "simple",
        "estimated_resources": {
            "cpu_cores": 1,
            "memory_gb": 1,
            "storage_gb": 5
        },
        "services": {
            "web": {
                "build": {
                    "context": ".",
                    "dockerfile": "Dockerfile"
                },
                "container_name": "{project_name}-flask",
                "restart": "unless-stopped",
                "environment": {
                    "DATABASE_URL": "postgresql://{db_user}:{db_password}@{project_name}-postgres:5432/{db_name}",
                    "REDIS_URL": "redis://{project_name}-redis:6379/0",
                    "SECRET_KEY": "{secret_key}",
                    "FLASK_ENV": "production"
                },
                "depends_on": ["postgres", "redis"],
                "ports": ["{port}:5000"],
                "networks": ["web", "internal"],
                "command": "gunicorn --bind 0.0.0.0:5000 --reuse-port --workers 4 {app_module}:app"
            },
            "postgres": {
                "image": "postgres:15",
                "container_name": "{project_name}-postgres",
                "restart": "unless-stopped",
                "environment": {
                    "POSTGRES_USER": "{db_user}",
                    "POSTGRES_PASSWORD": "{db_password}",
                    "POSTGRES_DB": "{db_name}"
                },
                "volumes": [
                    "{project_name}_postgres_data:/var/lib/postgresql/data"
                ],
                "networks": ["internal"]
            },
            "redis": {
                "image": "redis:7-alpine",
                "container_name": "{project_name}-redis",
                "restart": "unless-stopped",
                "networks": ["internal"]
            }
        },
        "volumes": {
            "{project_name}_postgres_data": {}
        },
        "networks": {
            "web": {"external": True, "name": "homelab"},
            "internal": {"driver": "bridge"}
        },
        "required_vars": ["project_name", "port", "db_user", "db_password", "db_name", "secret_key", "app_module"],
        "optional_vars": ["domain"],
        "default_port": 5000
    },
    
    "redis_cluster": {
        "name": "Redis Cluster",
        "description": "Highly available Redis cluster with 3 master nodes and 3 replicas",
        "category": "database",
        "complexity": "advanced",
        "multi_host": True,
        "estimated_resources": {
            "cpu_cores": 6,
            "memory_gb": 12,
            "storage_gb": 30
        },
        "services": {
            "redis-node-1": {
                "image": "redis:7-alpine",
                "container_name": "{project_name}-redis-1",
                "restart": "unless-stopped",
                "command": "redis-server --cluster-enabled yes --cluster-config-file nodes.conf --cluster-node-timeout 5000 --appendonly yes",
                "volumes": [
                    "{project_name}_redis_1:/data"
                ],
                "ports": ["7001:6379", "17001:16379"],
                "networks": ["redis-cluster"]
            },
            "redis-node-2": {
                "image": "redis:7-alpine",
                "container_name": "{project_name}-redis-2",
                "restart": "unless-stopped",
                "command": "redis-server --cluster-enabled yes --cluster-config-file nodes.conf --cluster-node-timeout 5000 --appendonly yes",
                "volumes": [
                    "{project_name}_redis_2:/data"
                ],
                "ports": ["7002:6379", "17002:16379"],
                "networks": ["redis-cluster"]
            },
            "redis-node-3": {
                "image": "redis:7-alpine",
                "container_name": "{project_name}-redis-3",
                "restart": "unless-stopped",
                "command": "redis-server --cluster-enabled yes --cluster-config-file nodes.conf --cluster-node-timeout 5000 --appendonly yes",
                "volumes": [
                    "{project_name}_redis_3:/data"
                ],
                "ports": ["7003:6379", "17003:16379"],
                "networks": ["redis-cluster"]
            }
        },
        "volumes": {
            "{project_name}_redis_1": {},
            "{project_name}_redis_2": {},
            "{project_name}_redis_3": {}
        },
        "networks": {
            "redis-cluster": {"driver": "bridge"}
        },
        "post_deploy_commands": [
            "docker exec {project_name}-redis-1 redis-cli --cluster create {host_1}:7001 {host_2}:7002 {host_3}:7003 --cluster-replicas 0 --cluster-yes"
        ],
        "required_vars": ["project_name"],
        "optional_vars": ["host_1", "host_2", "host_3"],
        "default_port": 7001
    },
    
    "postgres_ha": {
        "name": "PostgreSQL High Availability",
        "description": "PostgreSQL with streaming replication and PgBouncer",
        "category": "database",
        "complexity": "advanced",
        "estimated_resources": {
            "cpu_cores": 4,
            "memory_gb": 8,
            "storage_gb": 100
        },
        "services": {
            "postgres-primary": {
                "image": "postgres:15",
                "container_name": "{project_name}-postgres-primary",
                "restart": "unless-stopped",
                "environment": {
                    "POSTGRES_USER": "{db_user}",
                    "POSTGRES_PASSWORD": "{db_password}",
                    "POSTGRES_DB": "{db_name}",
                    "POSTGRES_REPLICATION_USER": "replicator",
                    "POSTGRES_REPLICATION_PASSWORD": "{replication_password}"
                },
                "volumes": [
                    "{project_name}_postgres_primary:/var/lib/postgresql/data"
                ],
                "ports": ["5432:5432"],
                "networks": ["postgres-net"],
                "healthcheck": {
                    "test": ["CMD-SHELL", "pg_isready -U {db_user}"],
                    "interval": "10s",
                    "timeout": "5s",
                    "retries": 5
                }
            },
            "postgres-replica": {
                "image": "postgres:15",
                "container_name": "{project_name}-postgres-replica",
                "restart": "unless-stopped",
                "environment": {
                    "POSTGRES_USER": "{db_user}",
                    "POSTGRES_PASSWORD": "{db_password}",
                    "POSTGRES_PRIMARY_HOST": "{project_name}-postgres-primary",
                    "POSTGRES_REPLICATION_USER": "replicator",
                    "POSTGRES_REPLICATION_PASSWORD": "{replication_password}"
                },
                "volumes": [
                    "{project_name}_postgres_replica:/var/lib/postgresql/data"
                ],
                "depends_on": ["postgres-primary"],
                "ports": ["5433:5432"],
                "networks": ["postgres-net"]
            },
            "pgbouncer": {
                "image": "edoburu/pgbouncer:latest",
                "container_name": "{project_name}-pgbouncer",
                "restart": "unless-stopped",
                "environment": {
                    "DATABASE_URL": "postgres://{db_user}:{db_password}@{project_name}-postgres-primary:5432/{db_name}",
                    "POOL_MODE": "transaction",
                    "MAX_CLIENT_CONN": "1000",
                    "DEFAULT_POOL_SIZE": "20"
                },
                "depends_on": ["postgres-primary"],
                "ports": ["6432:5432"],
                "networks": ["postgres-net", "web"]
            }
        },
        "volumes": {
            "{project_name}_postgres_primary": {},
            "{project_name}_postgres_replica": {}
        },
        "networks": {
            "postgres-net": {"driver": "bridge"},
            "web": {"external": True, "name": "homelab"}
        },
        "required_vars": ["project_name", "db_user", "db_password", "db_name", "replication_password"],
        "optional_vars": [],
        "default_port": 6432
    },
    
    "nextjs": {
        "name": "Next.js with Node.js Backend",
        "description": "Modern Next.js frontend with optional backend API",
        "category": "web",
        "complexity": "simple",
        "estimated_resources": {
            "cpu_cores": 2,
            "memory_gb": 2,
            "storage_gb": 5
        },
        "services": {
            "nextjs": {
                "build": {
                    "context": ".",
                    "dockerfile": "Dockerfile"
                },
                "container_name": "{project_name}-nextjs",
                "restart": "unless-stopped",
                "environment": {
                    "NODE_ENV": "production",
                    "NEXT_PUBLIC_API_URL": "{api_url}"
                },
                "ports": ["{port}:3000"],
                "networks": ["web"]
            }
        },
        "networks": {
            "web": {"external": True, "name": "homelab"}
        },
        "required_vars": ["project_name", "port"],
        "optional_vars": ["api_url", "domain"],
        "default_port": 3000
    },
    
    "monitoring_stack": {
        "name": "Monitoring Stack (Prometheus + Grafana + Loki)",
        "description": "Complete monitoring solution with metrics, logs, and alerting",
        "category": "infrastructure",
        "complexity": "medium",
        "estimated_resources": {
            "cpu_cores": 4,
            "memory_gb": 4,
            "storage_gb": 50
        },
        "services": {
            "prometheus": {
                "image": "prom/prometheus:latest",
                "container_name": "{project_name}-prometheus",
                "restart": "unless-stopped",
                "volumes": [
                    "{project_name}_prometheus_config:/etc/prometheus",
                    "{project_name}_prometheus_data:/prometheus"
                ],
                "command": [
                    "--config.file=/etc/prometheus/prometheus.yml",
                    "--storage.tsdb.path=/prometheus",
                    "--web.console.libraries=/usr/share/prometheus/console_libraries",
                    "--web.console.templates=/usr/share/prometheus/consoles",
                    "--storage.tsdb.retention.time=30d"
                ],
                "ports": ["9090:9090"],
                "networks": ["monitoring"]
            },
            "grafana": {
                "image": "grafana/grafana:latest",
                "container_name": "{project_name}-grafana",
                "restart": "unless-stopped",
                "environment": {
                    "GF_SECURITY_ADMIN_USER": "{admin_user}",
                    "GF_SECURITY_ADMIN_PASSWORD": "{admin_password}",
                    "GF_USERS_ALLOW_SIGN_UP": "false"
                },
                "volumes": [
                    "{project_name}_grafana_data:/var/lib/grafana"
                ],
                "depends_on": ["prometheus"],
                "ports": ["{port}:3000"],
                "networks": ["monitoring", "web"]
            },
            "loki": {
                "image": "grafana/loki:latest",
                "container_name": "{project_name}-loki",
                "restart": "unless-stopped",
                "volumes": [
                    "{project_name}_loki_data:/loki"
                ],
                "ports": ["3100:3100"],
                "networks": ["monitoring"]
            },
            "promtail": {
                "image": "grafana/promtail:latest",
                "container_name": "{project_name}-promtail",
                "restart": "unless-stopped",
                "volumes": [
                    "/var/log:/var/log:ro",
                    "/var/lib/docker/containers:/var/lib/docker/containers:ro"
                ],
                "depends_on": ["loki"],
                "networks": ["monitoring"]
            }
        },
        "volumes": {
            "{project_name}_prometheus_config": {},
            "{project_name}_prometheus_data": {},
            "{project_name}_grafana_data": {},
            "{project_name}_loki_data": {}
        },
        "networks": {
            "monitoring": {"driver": "bridge"},
            "web": {"external": True, "name": "homelab"}
        },
        "required_vars": ["project_name", "port", "admin_user", "admin_password"],
        "optional_vars": ["domain"],
        "default_port": 3000
    },
    
    "nginx_proxy": {
        "name": "Nginx Reverse Proxy with SSL",
        "description": "Nginx reverse proxy with automatic SSL via Let's Encrypt",
        "category": "infrastructure",
        "complexity": "simple",
        "estimated_resources": {
            "cpu_cores": 1,
            "memory_gb": 0.5,
            "storage_gb": 1
        },
        "services": {
            "nginx": {
                "image": "nginx:alpine",
                "container_name": "{project_name}-nginx",
                "restart": "unless-stopped",
                "volumes": [
                    "{project_name}_nginx_config:/etc/nginx/conf.d",
                    "{project_name}_nginx_certs:/etc/letsencrypt"
                ],
                "ports": ["80:80", "443:443"],
                "networks": ["web"]
            },
            "certbot": {
                "image": "certbot/certbot:latest",
                "container_name": "{project_name}-certbot",
                "volumes": [
                    "{project_name}_nginx_certs:/etc/letsencrypt",
                    "{project_name}_certbot_www:/var/www/certbot"
                ],
                "entrypoint": "/bin/sh -c 'trap exit TERM; while :; do certbot renew; sleep 12h & wait $${!}; done;'"
            }
        },
        "volumes": {
            "{project_name}_nginx_config": {},
            "{project_name}_nginx_certs": {},
            "{project_name}_certbot_www": {}
        },
        "networks": {
            "web": {"external": True, "name": "homelab"}
        },
        "required_vars": ["project_name"],
        "optional_vars": ["domain", "email"],
        "default_port": 80
    },
    
    "n8n": {
        "name": "n8n Workflow Automation",
        "description": "Self-hosted workflow automation platform with PostgreSQL",
        "category": "automation",
        "complexity": "simple",
        "estimated_resources": {
            "cpu_cores": 2,
            "memory_gb": 2,
            "storage_gb": 10
        },
        "services": {
            "n8n": {
                "image": "n8nio/n8n:latest",
                "container_name": "{project_name}-n8n",
                "restart": "unless-stopped",
                "environment": {
                    "DB_TYPE": "postgresdb",
                    "DB_POSTGRESDB_HOST": "{project_name}-postgres",
                    "DB_POSTGRESDB_PORT": "5432",
                    "DB_POSTGRESDB_DATABASE": "{db_name}",
                    "DB_POSTGRESDB_USER": "{db_user}",
                    "DB_POSTGRESDB_PASSWORD": "{db_password}",
                    "N8N_BASIC_AUTH_ACTIVE": "true",
                    "N8N_BASIC_AUTH_USER": "{admin_user}",
                    "N8N_BASIC_AUTH_PASSWORD": "{admin_password}",
                    "WEBHOOK_URL": "https://{domain}/"
                },
                "volumes": [
                    "{project_name}_n8n_data:/home/node/.n8n"
                ],
                "depends_on": ["postgres"],
                "ports": ["{port}:5678"],
                "networks": ["web", "internal"]
            },
            "postgres": {
                "image": "postgres:15",
                "container_name": "{project_name}-postgres",
                "restart": "unless-stopped",
                "environment": {
                    "POSTGRES_USER": "{db_user}",
                    "POSTGRES_PASSWORD": "{db_password}",
                    "POSTGRES_DB": "{db_name}"
                },
                "volumes": [
                    "{project_name}_postgres_data:/var/lib/postgresql/data"
                ],
                "networks": ["internal"]
            }
        },
        "volumes": {
            "{project_name}_n8n_data": {},
            "{project_name}_postgres_data": {}
        },
        "networks": {
            "web": {"external": True, "name": "homelab"},
            "internal": {"driver": "bridge"}
        },
        "required_vars": ["project_name", "port", "db_user", "db_password", "db_name", "admin_user", "admin_password"],
        "optional_vars": ["domain"],
        "default_port": 5678
    },

    "minio_cluster": {
        "name": "MinIO Object Storage Cluster",
        "description": "S3-compatible object storage with high availability",
        "category": "storage",
        "complexity": "advanced",
        "multi_host": True,
        "estimated_resources": {
            "cpu_cores": 8,
            "memory_gb": 16,
            "storage_gb": 500
        },
        "services": {
            "minio1": {
                "image": "minio/minio:latest",
                "container_name": "{project_name}-minio1",
                "restart": "unless-stopped",
                "command": "server http://{project_name}-minio{1...4}/data --console-address ':9001'",
                "environment": {
                    "MINIO_ROOT_USER": "{admin_user}",
                    "MINIO_ROOT_PASSWORD": "{admin_password}"
                },
                "volumes": [
                    "{project_name}_minio1_data:/data"
                ],
                "ports": ["9000:9000", "9001:9001"],
                "networks": ["minio-net"]
            },
            "minio2": {
                "image": "minio/minio:latest",
                "container_name": "{project_name}-minio2",
                "restart": "unless-stopped",
                "command": "server http://{project_name}-minio{1...4}/data --console-address ':9001'",
                "environment": {
                    "MINIO_ROOT_USER": "{admin_user}",
                    "MINIO_ROOT_PASSWORD": "{admin_password}"
                },
                "volumes": [
                    "{project_name}_minio2_data:/data"
                ],
                "networks": ["minio-net"]
            }
        },
        "volumes": {
            "{project_name}_minio1_data": {},
            "{project_name}_minio2_data": {}
        },
        "networks": {
            "minio-net": {"driver": "bridge"}
        },
        "required_vars": ["project_name", "admin_user", "admin_password"],
        "optional_vars": ["domain"],
        "default_port": 9000
    },
    
    "gitea": {
        "name": "Gitea Git Server",
        "description": "Self-hosted Git service with web interface",
        "category": "devops",
        "complexity": "simple",
        "estimated_resources": {
            "cpu_cores": 2,
            "memory_gb": 2,
            "storage_gb": 20
        },
        "services": {
            "gitea": {
                "image": "gitea/gitea:latest",
                "container_name": "{project_name}-gitea",
                "restart": "unless-stopped",
                "environment": {
                    "USER_UID": "1000",
                    "USER_GID": "1000",
                    "GITEA__database__DB_TYPE": "postgres",
                    "GITEA__database__HOST": "{project_name}-postgres:5432",
                    "GITEA__database__NAME": "{db_name}",
                    "GITEA__database__USER": "{db_user}",
                    "GITEA__database__PASSWD": "{db_password}",
                    "GITEA__server__ROOT_URL": "https://{domain}/"
                },
                "volumes": [
                    "{project_name}_gitea_data:/data",
                    "/etc/timezone:/etc/timezone:ro",
                    "/etc/localtime:/etc/localtime:ro"
                ],
                "depends_on": ["postgres"],
                "ports": ["{port}:3000", "{ssh_port}:22"],
                "networks": ["web", "internal"]
            },
            "postgres": {
                "image": "postgres:15",
                "container_name": "{project_name}-postgres",
                "restart": "unless-stopped",
                "environment": {
                    "POSTGRES_USER": "{db_user}",
                    "POSTGRES_PASSWORD": "{db_password}",
                    "POSTGRES_DB": "{db_name}"
                },
                "volumes": [
                    "{project_name}_postgres_data:/var/lib/postgresql/data"
                ],
                "networks": ["internal"]
            }
        },
        "volumes": {
            "{project_name}_gitea_data": {},
            "{project_name}_postgres_data": {}
        },
        "networks": {
            "web": {"external": True, "name": "homelab"},
            "internal": {"driver": "bridge"}
        },
        "required_vars": ["project_name", "port", "ssh_port", "db_user", "db_password", "db_name"],
        "optional_vars": ["domain"],
        "default_port": 3000
    }
}

SINGLE_SERVICE_TEMPLATES: Dict[str, Dict[str, Any]] = {
    "redis": {
        "name": "Redis",
        "description": "In-memory data store for caching and sessions",
        "image": "redis:7-alpine",
        "default_port": 6379,
        "volumes": ["{name}_data:/data"],
        "healthcheck": {
            "test": ["CMD", "redis-cli", "ping"],
            "interval": "10s",
            "timeout": "5s",
            "retries": 5
        }
    },
    "postgres": {
        "name": "PostgreSQL",
        "description": "Powerful open-source relational database",
        "image": "postgres:15",
        "default_port": 5432,
        "environment": {
            "POSTGRES_USER": "{db_user}",
            "POSTGRES_PASSWORD": "{db_password}",
            "POSTGRES_DB": "{db_name}"
        },
        "volumes": ["{name}_data:/var/lib/postgresql/data"],
        "healthcheck": {
            "test": ["CMD-SHELL", "pg_isready -U {db_user}"],
            "interval": "10s",
            "timeout": "5s",
            "retries": 5
        }
    },
    "mysql": {
        "name": "MySQL",
        "description": "Popular relational database",
        "image": "mysql:8.0",
        "default_port": 3306,
        "environment": {
            "MYSQL_ROOT_PASSWORD": "{db_root_password}",
            "MYSQL_DATABASE": "{db_name}",
            "MYSQL_USER": "{db_user}",
            "MYSQL_PASSWORD": "{db_password}"
        },
        "volumes": ["{name}_data:/var/lib/mysql"]
    },
    "mongodb": {
        "name": "MongoDB",
        "description": "NoSQL document database",
        "image": "mongo:7",
        "default_port": 27017,
        "environment": {
            "MONGO_INITDB_ROOT_USERNAME": "{mongo_user}",
            "MONGO_INITDB_ROOT_PASSWORD": "{mongo_password}"
        },
        "volumes": ["{name}_data:/data/db"]
    },
    "elasticsearch": {
        "name": "Elasticsearch",
        "description": "Distributed search and analytics engine",
        "image": "docker.elastic.co/elasticsearch/elasticsearch:8.11.0",
        "default_port": 9200,
        "environment": {
            "discovery.type": "single-node",
            "ES_JAVA_OPTS": "-Xms512m -Xmx512m",
            "xpack.security.enabled": "false"
        },
        "volumes": ["{name}_data:/usr/share/elasticsearch/data"]
    },
    "rabbitmq": {
        "name": "RabbitMQ",
        "description": "Message broker for distributed systems",
        "image": "rabbitmq:3-management-alpine",
        "default_port": 5672,
        "environment": {
            "RABBITMQ_DEFAULT_USER": "{rabbit_user}",
            "RABBITMQ_DEFAULT_PASS": "{rabbit_password}"
        },
        "volumes": ["{name}_data:/var/lib/rabbitmq"],
        "ports_extra": ["15672:15672"]
    },
    "nginx": {
        "name": "Nginx",
        "description": "High-performance web server",
        "image": "nginx:alpine",
        "default_port": 80,
        "volumes": [
            "{name}_config:/etc/nginx/conf.d",
            "{name}_html:/usr/share/nginx/html"
        ]
    },
    "traefik": {
        "name": "Traefik",
        "description": "Modern reverse proxy and load balancer",
        "image": "traefik:v3.0",
        "default_port": 80,
        "command": [
            "--api.insecure=true",
            "--providers.docker=true",
            "--providers.docker.exposedbydefault=false",
            "--entrypoints.web.address=:80",
            "--entrypoints.websecure.address=:443"
        ],
        "volumes": [
            "/var/run/docker.sock:/var/run/docker.sock:ro"
        ],
        "ports_extra": ["443:443", "8080:8080"]
    }
}


def get_stack_template(stack_name: str) -> Optional[Dict[str, Any]]:
    """Get a stack template by name"""
    return STACK_TEMPLATES.get(stack_name.lower())


def get_single_service_template(service_name: str) -> Optional[Dict[str, Any]]:
    """Get a single service template by name"""
    return SINGLE_SERVICE_TEMPLATES.get(service_name.lower())


def list_available_stacks() -> List[Dict[str, str]]:
    """List all available stack templates"""
    return [
        {
            "id": key,
            "name": value["name"],
            "description": value["description"],
            "category": value["category"],
            "complexity": value["complexity"]
        }
        for key, value in STACK_TEMPLATES.items()
    ]


def list_available_services() -> List[Dict[str, str]]:
    """List all available single service templates"""
    return [
        {
            "id": key,
            "name": value["name"],
            "description": value["description"],
            "default_port": value["default_port"]
        }
        for key, value in SINGLE_SERVICE_TEMPLATES.items()
    ]


def get_stack_by_category(category: str) -> List[Dict[str, Any]]:
    """Get all stacks in a specific category"""
    return [
        {"id": key, **value}
        for key, value in STACK_TEMPLATES.items()
        if value.get("category") == category
    ]


def get_multi_host_stacks() -> List[Dict[str, Any]]:
    """Get stacks that support multi-host deployment"""
    return [
        {"id": key, **value}
        for key, value in STACK_TEMPLATES.items()
        if value.get("multi_host", False)
    ]
