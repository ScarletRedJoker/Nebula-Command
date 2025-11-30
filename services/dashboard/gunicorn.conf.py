import multiprocessing
import os

bind = "0.0.0.0:5000"

workers = 4

worker_class = "sync"

threads = 2

timeout = 120

graceful_timeout = 30

keepalive = 5

max_requests = 1000
max_requests_jitter = 50

preload_app = True

accesslog = "-"
errorlog = "-"
loglevel = os.environ.get("GUNICORN_LOG_LEVEL", "info")

access_log_format = '%(h)s %(l)s %(u)s %(t)s "%(r)s" %(s)s %(b)s "%(f)s" "%(a)s" %(D)s'

capture_output = True
enable_stdio_inheritance = True

forwarded_allow_ips = "*"
proxy_allow_ips = "*"
proxy_protocol = False

worker_tmp_dir = "/dev/shm"

limit_request_line = 4094
limit_request_fields = 100
limit_request_field_size = 8190

def on_starting(server):
    """Called just before the master process is initialized."""
    pass

def on_reload(server):
    """Called to recycle workers during a reload via SIGHUP."""
    pass

def worker_int(worker):
    """Called when a worker receives SIGINT or SIGQUIT."""
    pass

def worker_abort(worker):
    """Called when a worker receives SIGABRT."""
    pass

def pre_fork(server, worker):
    """Called just before a worker is forked."""
    pass

def post_fork(server, worker):
    """Called just after a worker has been forked."""
    pass

def post_worker_init(worker):
    """Called just after a worker has initialized the application."""
    pass

def worker_exit(server, worker):
    """Called just after a worker has been exited, in the master process."""
    pass

def nworkers_changed(server, new_value, old_value):
    """Called just after num_workers has been changed."""
    pass

def on_exit(server):
    """Called just before exiting Gunicorn."""
    pass
