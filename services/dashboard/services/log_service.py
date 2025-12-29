"""
Log Service - Unified log aggregation, parsing, and streaming
Supports: file logs, Docker container logs, systemd journal logs
"""
import logging
import os
import re
import json
import queue
import threading
import subprocess
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any, Generator
from collections import deque

logger = logging.getLogger(__name__)

try:
    import docker
    DOCKER_AVAILABLE = True
except ImportError:
    DOCKER_AVAILABLE = False
    logger.warning("Docker SDK not available - Docker log parsing disabled")


class SSELogClient:
    """Server-Sent Events client for log streaming"""
    def __init__(self, client_id: str, filters: dict = None):
        self.client_id = client_id
        self.queue = queue.Queue(maxsize=1000)
        self.connected = True
        self.filters = filters or {}
        self.created_at = datetime.now()
    
    def send(self, log_entry: dict) -> bool:
        if not self.connected:
            return False
        if not self._matches_filters(log_entry):
            return False
        try:
            self.queue.put_nowait(log_entry)
            return True
        except queue.Full:
            return False
    
    def _matches_filters(self, entry: dict) -> bool:
        if 'source' in self.filters and self.filters['source']:
            if entry.get('source') != self.filters['source']:
                return False
        if 'level' in self.filters and self.filters['level']:
            levels = self.filters['level'] if isinstance(self.filters['level'], list) else [self.filters['level']]
            if entry.get('level', '').lower() not in [l.lower() for l in levels]:
                return False
        if 'search' in self.filters and self.filters['search']:
            pattern = self.filters['search']
            message = entry.get('message', '')
            try:
                if not re.search(pattern, message, re.IGNORECASE):
                    return False
            except re.error:
                if pattern.lower() not in message.lower():
                    return False
        return True
    
    def disconnect(self):
        self.connected = False


class LogService:
    """Unified log aggregation service"""
    
    LEVEL_PATTERNS = {
        'error': re.compile(r'\b(error|err|fatal|critical|exception|fail(ed)?)\b', re.I),
        'warning': re.compile(r'\b(warn(ing)?|caution)\b', re.I),
        'debug': re.compile(r'\b(debug|trace|verbose)\b', re.I),
        'info': re.compile(r'\b(info|notice)\b', re.I),
    }
    
    TIMESTAMP_PATTERNS = [
        re.compile(r'(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)', re.I),
        re.compile(r'(\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})', re.I),
        re.compile(r'(\d{2}/\w{3}/\d{4}:\d{2}:\d{2}:\d{2})', re.I),
    ]
    
    def __init__(self, max_buffer=1000):
        self.max_buffer = max_buffer
        self.log_buffer = deque(maxlen=max_buffer)
        self.buffer_lock = threading.Lock()
        self.sse_clients: Dict[str, SSELogClient] = {}
        self.sse_lock = threading.Lock()
        self.docker_client = None
        self._init_docker()
        self.watching_files: Dict[str, threading.Thread] = {}
        self.watch_stop_events: Dict[str, threading.Event] = {}
    
    def _init_docker(self):
        if DOCKER_AVAILABLE:
            try:
                self.docker_client = docker.from_env()
                self.docker_client.ping()
                logger.info("Docker client initialized for log service")
            except Exception as e:
                logger.warning(f"Docker client initialization failed: {e}")
                self.docker_client = None
    
    def _get_db_session(self):
        try:
            from services.db_service import db_service
            if not db_service.is_available:
                return None
            return db_service.get_session()
        except Exception as e:
            logger.error(f"Database error: {e}")
            return None
    
    def _detect_level(self, message: str, source: str = None) -> str:
        for level, pattern in self.LEVEL_PATTERNS.items():
            if pattern.search(message):
                return level
        return 'info'
    
    def _parse_timestamp(self, line: str) -> Optional[datetime]:
        for pattern in self.TIMESTAMP_PATTERNS:
            match = pattern.search(line)
            if match:
                ts_str = match.group(1)
                for fmt in [
                    '%Y-%m-%dT%H:%M:%S.%fZ',
                    '%Y-%m-%dT%H:%M:%S.%f%z',
                    '%Y-%m-%dT%H:%M:%S%z',
                    '%Y-%m-%d %H:%M:%S.%f',
                    '%Y-%m-%d %H:%M:%S',
                    '%b %d %H:%M:%S',
                    '%d/%b/%Y:%H:%M:%S',
                ]:
                    try:
                        return datetime.strptime(ts_str, fmt)
                    except ValueError:
                        continue
        return None
    
    def add_log_entry(
        self,
        source: str,
        message: str,
        level: str = None,
        timestamp: datetime = None,
        container_name: str = None,
        host: str = None,
        metadata: dict = None,
        persist: bool = False,
        stream_id: int = None
    ) -> dict:
        if level is None:
            level = self._detect_level(message, source)
        if timestamp is None:
            timestamp = self._parse_timestamp(message) or datetime.utcnow()
        
        entry = {
            'id': None,
            'source': source,
            'level': level.lower(),
            'message': message.strip(),
            'timestamp': timestamp.isoformat(),
            'container_name': container_name,
            'host': host,
            'metadata': metadata,
            'stream_id': stream_id
        }
        
        with self.buffer_lock:
            self.log_buffer.append(entry)
        
        self._broadcast_to_sse(entry)
        
        if persist:
            self._persist_entry(entry)
        
        return entry
    
    def _persist_entry(self, entry: dict):
        try:
            from models.logs import LogEntry
            session = self._get_db_session()
            if not session:
                return
            
            with session:
                log_entry = LogEntry.create_entry(
                    source=entry['source'],
                    level=entry['level'],
                    message=entry['message'],
                    container_name=entry.get('container_name'),
                    host=entry.get('host'),
                    metadata_json=entry.get('metadata'),
                    stream_id=entry.get('stream_id')
                )
                session.add(log_entry)
                session.commit()
                entry['id'] = log_entry.id
        except Exception as e:
            logger.error(f"Failed to persist log entry: {e}")
    
    def _broadcast_to_sse(self, entry: dict):
        with self.sse_lock:
            disconnected = []
            for client_id, client in self.sse_clients.items():
                if not client.connected:
                    disconnected.append(client_id)
                else:
                    client.send(entry)
            for client_id in disconnected:
                del self.sse_clients[client_id]
    
    def register_sse_client(self, client_id: str, filters: dict = None) -> SSELogClient:
        with self.sse_lock:
            client = SSELogClient(client_id, filters)
            self.sse_clients[client_id] = client
            logger.info(f"SSE client registered: {client_id}")
            return client
    
    def unregister_sse_client(self, client_id: str):
        with self.sse_lock:
            if client_id in self.sse_clients:
                self.sse_clients[client_id].disconnect()
                del self.sse_clients[client_id]
                logger.info(f"SSE client unregistered: {client_id}")
    
    def get_buffered_logs(
        self,
        source: str = None,
        level: str = None,
        search: str = None,
        limit: int = 100,
        offset: int = 0
    ) -> List[dict]:
        with self.buffer_lock:
            logs = list(self.log_buffer)
        
        if source:
            logs = [l for l in logs if l.get('source') == source]
        if level:
            levels = level.split(',') if isinstance(level, str) else level
            logs = [l for l in logs if l.get('level', '').lower() in [lv.lower() for lv in levels]]
        if search:
            try:
                pattern = re.compile(search, re.IGNORECASE)
                logs = [l for l in logs if pattern.search(l.get('message', ''))]
            except re.error:
                logs = [l for l in logs if search.lower() in l.get('message', '').lower()]
        
        logs.reverse()
        return logs[offset:offset + limit]
    
    def query_logs(
        self,
        source: str = None,
        level: str = None,
        search: str = None,
        start_time: datetime = None,
        end_time: datetime = None,
        container_name: str = None,
        limit: int = 100,
        offset: int = 0,
        stream_id: int = None
    ) -> Dict[str, Any]:
        try:
            from models.logs import LogEntry
            session = self._get_db_session()
            if not session:
                return {
                    'logs': self.get_buffered_logs(source, level, search, limit, offset),
                    'total': len(self.log_buffer),
                    'source': 'buffer'
                }
            
            with session:
                query = session.query(LogEntry)
                
                if source:
                    query = query.filter(LogEntry.source == source)
                if level:
                    levels = level.split(',') if isinstance(level, str) else level
                    query = query.filter(LogEntry.level.in_([l.lower() for l in levels]))
                if search:
                    query = query.filter(LogEntry.message.ilike(f'%{search}%'))
                if start_time:
                    query = query.filter(LogEntry.timestamp >= start_time)
                if end_time:
                    query = query.filter(LogEntry.timestamp <= end_time)
                if container_name:
                    query = query.filter(LogEntry.container_name == container_name)
                if stream_id:
                    query = query.filter(LogEntry.stream_id == stream_id)
                
                total = query.count()
                logs = query.order_by(LogEntry.timestamp.desc()).offset(offset).limit(limit).all()
                
                return {
                    'logs': [log.to_dict() for log in logs],
                    'total': total,
                    'source': 'database',
                    'limit': limit,
                    'offset': offset
                }
        except Exception as e:
            logger.error(f"Query logs error: {e}")
            return {
                'logs': self.get_buffered_logs(source, level, search, limit, offset),
                'total': len(self.log_buffer),
                'source': 'buffer',
                'error': str(e)
            }
    
    def full_text_search(
        self,
        query: str,
        source: str = None,
        level: str = None,
        limit: int = 100,
        regex: bool = False
    ) -> Dict[str, Any]:
        try:
            from models.logs import LogEntry
            session = self._get_db_session()
            if not session:
                return {
                    'results': self.get_buffered_logs(source, level, query, limit),
                    'query': query,
                    'source': 'buffer'
                }
            
            with session:
                db_query = session.query(LogEntry)
                
                if source:
                    db_query = db_query.filter(LogEntry.source == source)
                if level:
                    levels = level.split(',') if isinstance(level, str) else level
                    db_query = db_query.filter(LogEntry.level.in_([l.lower() for l in levels]))
                
                if regex:
                    db_query = db_query.filter(LogEntry.message.op('~*')(query))
                else:
                    db_query = db_query.filter(LogEntry.message.ilike(f'%{query}%'))
                
                results = db_query.order_by(LogEntry.timestamp.desc()).limit(limit).all()
                
                return {
                    'results': [log.to_dict() for log in results],
                    'query': query,
                    'regex': regex,
                    'count': len(results),
                    'source': 'database'
                }
        except Exception as e:
            logger.error(f"Full text search error: {e}")
            return {
                'results': self.get_buffered_logs(source, level, query, limit),
                'query': query,
                'error': str(e),
                'source': 'buffer'
            }
    
    def tail_file(
        self,
        file_path: str,
        lines: int = 100,
        follow: bool = False,
        source_name: str = None
    ) -> Generator[dict, None, None]:
        if not os.path.exists(file_path):
            yield {'error': f'File not found: {file_path}'}
            return
        
        source = source_name or os.path.basename(file_path)
        
        try:
            if follow:
                cmd = ['tail', '-n', str(lines), '-f', file_path]
                process = subprocess.Popen(
                    cmd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True
                )
                
                for line in process.stdout:
                    entry = self.add_log_entry(
                        source=source,
                        message=line,
                        metadata={'file_path': file_path}
                    )
                    yield entry
            else:
                cmd = ['tail', '-n', str(lines), file_path]
                result = subprocess.run(cmd, capture_output=True, text=True)
                
                for line in result.stdout.splitlines():
                    entry = self.add_log_entry(
                        source=source,
                        message=line,
                        metadata={'file_path': file_path}
                    )
                    yield entry
        except Exception as e:
            yield {'error': str(e)}
    
    def get_docker_logs(
        self,
        container_name: str,
        lines: int = 100,
        since: datetime = None,
        until: datetime = None,
        follow: bool = False
    ) -> Generator[dict, None, None]:
        if not self.docker_client:
            yield {'error': 'Docker client not available'}
            return
        
        try:
            container = self.docker_client.containers.get(container_name)
            
            kwargs = {
                'stdout': True,
                'stderr': True,
                'timestamps': True,
                'tail': lines if not follow else 'all'
            }
            
            if since:
                kwargs['since'] = since
            if until:
                kwargs['until'] = until
            if follow:
                kwargs['stream'] = True
                kwargs['follow'] = True
            
            logs = container.logs(**kwargs)
            
            if follow:
                for line in logs:
                    if isinstance(line, bytes):
                        line = line.decode('utf-8', errors='replace')
                    entry = self.add_log_entry(
                        source=f'docker:{container_name}',
                        message=line,
                        container_name=container_name,
                        metadata={'container_id': container.short_id}
                    )
                    yield entry
            else:
                if isinstance(logs, bytes):
                    logs = logs.decode('utf-8', errors='replace')
                for line in logs.splitlines():
                    entry = self.add_log_entry(
                        source=f'docker:{container_name}',
                        message=line,
                        container_name=container_name,
                        metadata={'container_id': container.short_id}
                    )
                    yield entry
        except docker.errors.NotFound:
            yield {'error': f'Container not found: {container_name}'}
        except Exception as e:
            yield {'error': str(e)}
    
    def get_docker_containers(self) -> List[dict]:
        if not self.docker_client:
            return []
        
        try:
            containers = self.docker_client.containers.list(all=True)
            return [
                {
                    'id': c.short_id,
                    'name': c.name,
                    'status': c.status,
                    'image': c.image.tags[0] if c.image.tags else c.image.short_id
                }
                for c in containers
            ]
        except Exception as e:
            logger.error(f"Get Docker containers error: {e}")
            return []
    
    def get_systemd_logs(
        self,
        unit: str = None,
        lines: int = 100,
        since: str = None,
        priority: str = None,
        follow: bool = False
    ) -> Generator[dict, None, None]:
        try:
            cmd = ['journalctl', '--no-pager', '-o', 'json']
            
            if unit:
                cmd.extend(['-u', unit])
            if lines and not follow:
                cmd.extend(['-n', str(lines)])
            if since:
                cmd.extend(['--since', since])
            if priority:
                cmd.extend(['-p', priority])
            if follow:
                cmd.append('-f')
            
            process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True
            )
            
            for line in process.stdout:
                try:
                    entry_data = json.loads(line)
                    
                    priority_map = {
                        '0': 'error', '1': 'error', '2': 'error', '3': 'error',
                        '4': 'warning', '5': 'info', '6': 'info', '7': 'debug'
                    }
                    level = priority_map.get(str(entry_data.get('PRIORITY', '6')), 'info')
                    
                    timestamp = None
                    if '__REALTIME_TIMESTAMP' in entry_data:
                        ts_us = int(entry_data['__REALTIME_TIMESTAMP'])
                        timestamp = datetime.fromtimestamp(ts_us / 1000000)
                    
                    entry = self.add_log_entry(
                        source=f'systemd:{unit}' if unit else 'systemd',
                        message=entry_data.get('MESSAGE', ''),
                        level=level,
                        timestamp=timestamp,
                        host=entry_data.get('_HOSTNAME'),
                        metadata={
                            'unit': entry_data.get('_SYSTEMD_UNIT'),
                            'pid': entry_data.get('_PID'),
                            'uid': entry_data.get('_UID'),
                        }
                    )
                    yield entry
                except json.JSONDecodeError:
                    entry = self.add_log_entry(
                        source=f'systemd:{unit}' if unit else 'systemd',
                        message=line.strip()
                    )
                    yield entry
                    
            if not follow:
                process.wait()
        except FileNotFoundError:
            yield {'error': 'journalctl not found - systemd logs not available'}
        except Exception as e:
            yield {'error': str(e)}
    
    def get_systemd_units(self) -> List[dict]:
        try:
            result = subprocess.run(
                ['systemctl', 'list-units', '--type=service', '--no-pager', '--plain'],
                capture_output=True,
                text=True
            )
            
            units = []
            for line in result.stdout.splitlines()[1:]:
                parts = line.split()
                if len(parts) >= 4:
                    units.append({
                        'name': parts[0],
                        'load': parts[1],
                        'active': parts[2],
                        'sub': parts[3],
                        'description': ' '.join(parts[4:]) if len(parts) > 4 else ''
                    })
            return units
        except Exception as e:
            logger.error(f"Get systemd units error: {e}")
            return []
    
    def get_log_streams(self) -> List[dict]:
        try:
            from models.logs import LogStream
            session = self._get_db_session()
            if not session:
                return []
            
            with session:
                streams = session.query(LogStream).filter(LogStream.enabled == True).all()
                return [s.to_dict() for s in streams]
        except Exception as e:
            logger.error(f"Get log streams error: {e}")
            return []
    
    def create_log_stream(
        self,
        name: str,
        source_type: str,
        source_path: str = None,
        container_name: str = None,
        systemd_unit: str = None,
        description: str = None,
        **kwargs
    ) -> Dict[str, Any]:
        try:
            from models.logs import LogStream
            session = self._get_db_session()
            if not session:
                return {'error': 'Database not available'}
            
            with session:
                existing = session.query(LogStream).filter(LogStream.name == name).first()
                if existing:
                    return {'error': f'Stream with name "{name}" already exists'}
                
                stream = LogStream.create_stream(
                    name=name,
                    source_type=source_type,
                    source_path=source_path,
                    container_name=container_name,
                    systemd_unit=systemd_unit,
                    description=description,
                    **kwargs
                )
                session.add(stream)
                session.commit()
                
                return {'success': True, 'stream': stream.to_dict()}
        except Exception as e:
            logger.error(f"Create log stream error: {e}")
            return {'error': str(e)}
    
    def delete_log_stream(self, stream_id: int) -> Dict[str, Any]:
        try:
            from models.logs import LogStream
            session = self._get_db_session()
            if not session:
                return {'error': 'Database not available'}
            
            with session:
                stream = session.query(LogStream).filter(LogStream.id == stream_id).first()
                if not stream:
                    return {'error': 'Stream not found'}
                
                session.delete(stream)
                session.commit()
                return {'success': True, 'deleted': stream_id}
        except Exception as e:
            logger.error(f"Delete log stream error: {e}")
            return {'error': str(e)}
    
    def get_sources(self) -> List[dict]:
        sources = []
        
        sources.append({
            'type': 'application',
            'name': 'application',
            'display_name': 'Application Logs',
            'available': True
        })
        
        containers = self.get_docker_containers()
        for c in containers:
            sources.append({
                'type': 'docker',
                'name': f"docker:{c['name']}",
                'display_name': f"Docker: {c['name']}",
                'container_id': c['id'],
                'status': c['status'],
                'available': c['status'] == 'running'
            })
        
        units = self.get_systemd_units()
        for u in units[:20]:
            sources.append({
                'type': 'systemd',
                'name': f"systemd:{u['name']}",
                'display_name': f"Systemd: {u['name']}",
                'unit': u['name'],
                'active': u['active'] == 'active',
                'available': True
            })
        
        streams = self.get_log_streams()
        for s in streams:
            sources.append({
                'type': 'stream',
                'name': f"stream:{s['name']}",
                'display_name': f"Stream: {s['name']}",
                'stream_id': s['id'],
                'source_type': s['source_type'],
                'available': s['enabled']
            })
        
        return sources
    
    def get_stats(self) -> Dict[str, Any]:
        stats = {
            'buffer_size': len(self.log_buffer),
            'buffer_max': self.max_buffer,
            'sse_clients': len(self.sse_clients),
            'docker_available': self.docker_client is not None,
            'docker_containers': len(self.get_docker_containers()) if self.docker_client else 0,
        }
        
        try:
            from models.logs import LogEntry, LogStream
            session = self._get_db_session()
            if session:
                with session:
                    stats['total_logs'] = session.query(LogEntry).count()
                    stats['total_streams'] = session.query(LogStream).count()
                    
                    since_hour = datetime.utcnow() - timedelta(hours=1)
                    stats['logs_last_hour'] = session.query(LogEntry).filter(
                        LogEntry.timestamp >= since_hour
                    ).count()
                    
                    level_counts = {}
                    for level in ['error', 'warning', 'info', 'debug']:
                        level_counts[level] = session.query(LogEntry).filter(
                            LogEntry.level == level,
                            LogEntry.timestamp >= since_hour
                        ).count()
                    stats['level_counts'] = level_counts
        except Exception as e:
            logger.error(f"Get stats error: {e}")
        
        return stats


log_service = LogService()
