"""
Anomaly Detection Service
Monitor CPU, memory, disk usage patterns and detect anomalies
"""
import logging
import math
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
from collections import defaultdict

from services.service_ops import service_ops
from services.db_service import db_service
from config import Config

logger = logging.getLogger(__name__)


class AnomalyDetector:
    """
    Service for detecting anomalies in system metrics
    
    Features:
    - Monitor CPU, memory, disk usage patterns
    - Alert when metrics deviate from baseline
    - Anomaly scoring algorithm using z-score and IQR
    - Automatic baseline learning
    """
    
    METRICS = ['cpu_percent', 'memory_percent', 'disk_percent', 'restart_count']
    
    SEVERITY_THRESHOLDS = {
        'critical': 4.0,
        'high': 3.0,
        'medium': 2.0,
        'warning': 1.5
    }
    
    DEFAULT_SENSITIVITY = 2.0
    
    def __init__(self):
        self.config = Config()
        self._baseline_cache = {}
        self._cache_ttl = 300
        self._last_cache_update = None
    
    def collect_current_metrics(self) -> Dict[str, Dict]:
        """
        Collect current metrics for all services
        
        Returns:
            Dict mapping service names to their current metrics
        """
        metrics = {}
        
        for service_key, service_info in self.config.SERVICES.items():
            container_name = service_info.get('container')
            if not container_name:
                continue
            
            stats = service_ops.collect_container_stats(service_key, container_name)
            
            if stats:
                memory_usage = stats.get('memory_usage', 0)
                memory_limit = stats.get('memory_limit', 1)
                memory_percent = (memory_usage / memory_limit * 100) if memory_limit > 0 else 0
                
                metrics[service_key] = {
                    'cpu_percent': stats.get('cpu_percent', 0),
                    'memory_percent': memory_percent,
                    'memory_usage_mb': memory_usage / (1024 * 1024),
                    'memory_limit_mb': memory_limit / (1024 * 1024),
                    'restart_count': stats.get('restart_count', 0),
                    'uptime_seconds': stats.get('uptime_seconds', 0),
                    'status': stats.get('status', 'unknown'),
                    'collected_at': datetime.utcnow().isoformat()
                }
        
        return metrics
    
    def get_baseline(self, service_name: str, metric_name: str) -> Optional[Dict]:
        """
        Get baseline statistics for a service metric
        
        Args:
            service_name: Name of the service
            metric_name: Name of the metric
            
        Returns:
            Baseline statistics or None if not found
        """
        cache_key = f"{service_name}:{metric_name}"
        
        if self._last_cache_update and cache_key in self._baseline_cache:
            if (datetime.utcnow() - self._last_cache_update).seconds < self._cache_ttl:
                return self._baseline_cache[cache_key]
        
        try:
            from models.jarvis_ai import AnomalyBaseline
            
            with db_service.get_session() as session:
                baseline = session.query(AnomalyBaseline).filter(
                    AnomalyBaseline.service_name == service_name,
                    AnomalyBaseline.metric_name == metric_name
                ).first()
                
                if baseline:
                    result = baseline.to_dict()
                    self._baseline_cache[cache_key] = result
                    self._last_cache_update = datetime.utcnow()
                    return result
        except Exception as e:
            logger.error(f"Failed to get baseline for {service_name}/{metric_name}: {e}")
        
        return None
    
    def update_baseline(
        self,
        service_name: str,
        metric_name: str,
        values: List[float],
        time_window_hours: int = 24
    ) -> Optional[Dict]:
        """
        Update baseline statistics for a service metric
        
        Args:
            service_name: Name of the service
            metric_name: Name of the metric
            values: List of metric values to compute baseline from
            time_window_hours: Time window for the baseline
            
        Returns:
            Updated baseline statistics
        """
        if not values:
            return None
        
        n = len(values)
        mean_value = sum(values) / n
        
        variance = sum((x - mean_value) ** 2 for x in values) / n if n > 1 else 0
        std_dev = math.sqrt(variance)
        
        sorted_values = sorted(values)
        min_value = sorted_values[0]
        max_value = sorted_values[-1]
        
        def percentile(data, p):
            k = (len(data) - 1) * p / 100
            f = math.floor(k)
            c = math.ceil(k)
            if f == c:
                return data[int(k)]
            return data[int(f)] * (c - k) + data[int(c)] * (k - f)
        
        p25 = percentile(sorted_values, 25) if n >= 4 else None
        p50 = percentile(sorted_values, 50) if n >= 2 else None
        p75 = percentile(sorted_values, 75) if n >= 4 else None
        p95 = percentile(sorted_values, 95) if n >= 20 else None
        p99 = percentile(sorted_values, 99) if n >= 100 else None
        
        sensitivity = self.DEFAULT_SENSITIVITY
        threshold_low = mean_value - (sensitivity * std_dev)
        threshold_high = mean_value + (sensitivity * std_dev)
        
        try:
            from models.jarvis_ai import AnomalyBaseline
            
            with db_service.get_session() as session:
                baseline = session.query(AnomalyBaseline).filter(
                    AnomalyBaseline.service_name == service_name,
                    AnomalyBaseline.metric_name == metric_name
                ).first()
                
                if baseline:
                    baseline.mean_value = mean_value
                    baseline.std_dev = std_dev
                    baseline.min_value = min_value
                    baseline.max_value = max_value
                    baseline.percentile_25 = p25
                    baseline.percentile_50 = p50
                    baseline.percentile_75 = p75
                    baseline.percentile_95 = p95
                    baseline.percentile_99 = p99
                    baseline.sample_count = n
                    baseline.last_sample_value = values[-1] if values else None
                    baseline.anomaly_threshold_low = max(0, threshold_low)
                    baseline.anomaly_threshold_high = threshold_high
                    baseline.sensitivity = sensitivity
                    baseline.time_window_hours = time_window_hours
                    baseline.updated_at = datetime.utcnow()
                else:
                    baseline = AnomalyBaseline(
                        service_name=service_name,
                        metric_name=metric_name,
                        mean_value=mean_value,
                        std_dev=std_dev,
                        min_value=min_value,
                        max_value=max_value,
                        percentile_25=p25,
                        percentile_50=p50,
                        percentile_75=p75,
                        percentile_95=p95,
                        percentile_99=p99,
                        sample_count=n,
                        last_sample_value=values[-1] if values else None,
                        anomaly_threshold_low=max(0, threshold_low),
                        anomaly_threshold_high=threshold_high,
                        sensitivity=sensitivity,
                        time_window_hours=time_window_hours
                    )
                    session.add(baseline)
                
                session.flush()
                result = baseline.to_dict()
            
            cache_key = f"{service_name}:{metric_name}"
            self._baseline_cache[cache_key] = result
            
            return result
        except Exception as e:
            logger.error(f"Failed to update baseline for {service_name}/{metric_name}: {e}")
            return None
    
    def detect_anomaly(
        self,
        service_name: str,
        metric_name: str,
        value: float
    ) -> Tuple[bool, float, str, str]:
        """
        Detect if a value is an anomaly for a given metric
        
        Args:
            service_name: Name of the service
            metric_name: Name of the metric
            value: Current metric value
            
        Returns:
            Tuple of (is_anomaly, score, severity, direction)
        """
        baseline = self.get_baseline(service_name, metric_name)
        
        if not baseline:
            return (False, 0.0, 'unknown', 'normal')
        
        stats = baseline.get('statistics', {})
        thresholds = baseline.get('thresholds', {})
        
        mean_value = stats.get('mean', 0)
        std_dev = stats.get('std_dev', 0)
        
        if std_dev == 0:
            return (False, 0.0, 'unknown', 'normal')
        
        z_score = abs(value - mean_value) / std_dev
        
        is_anomaly = False
        direction = 'normal'
        
        threshold_low = thresholds.get('low')
        threshold_high = thresholds.get('high')
        
        if threshold_low is not None and value < threshold_low:
            is_anomaly = True
            direction = 'below'
        elif threshold_high is not None and value > threshold_high:
            is_anomaly = True
            direction = 'above'
        elif z_score > thresholds.get('sensitivity', self.DEFAULT_SENSITIVITY):
            is_anomaly = True
            direction = 'above' if value > mean_value else 'below'
        
        severity = 'normal'
        if is_anomaly:
            for sev, threshold in sorted(self.SEVERITY_THRESHOLDS.items(), key=lambda x: x[1], reverse=True):
                if z_score >= threshold:
                    severity = sev
                    break
        
        return (is_anomaly, z_score, severity, direction)
    
    def detect_all_anomalies(self, metrics: Dict[str, Dict] = None) -> List[Dict]:
        """
        Detect anomalies across all services and metrics
        
        Args:
            metrics: Optional pre-collected metrics (will collect if not provided)
            
        Returns:
            List of detected anomalies
        """
        if metrics is None:
            metrics = self.collect_current_metrics()
        
        anomalies = []
        
        for service_name, service_metrics in metrics.items():
            for metric_name in self.METRICS:
                if metric_name not in service_metrics:
                    continue
                
                value = service_metrics.get(metric_name)
                if value is None:
                    continue
                
                is_anomaly, score, severity, direction = self.detect_anomaly(
                    service_name, metric_name, value
                )
                
                if is_anomaly:
                    baseline = self.get_baseline(service_name, metric_name)
                    
                    anomaly = {
                        'service_name': service_name,
                        'metric_name': metric_name,
                        'value': value,
                        'baseline_mean': baseline.get('statistics', {}).get('mean') if baseline else None,
                        'baseline_std': baseline.get('statistics', {}).get('std_dev') if baseline else None,
                        'anomaly_score': score,
                        'severity': severity,
                        'direction': direction,
                        'detected_at': datetime.utcnow().isoformat()
                    }
                    anomalies.append(anomaly)
                    
                    self._record_anomaly_event(anomaly)
        
        return anomalies
    
    def get_anomaly_events(
        self,
        service_name: str = None,
        severity: str = None,
        hours: int = 24,
        limit: int = 100,
        include_acknowledged: bool = False
    ) -> List[Dict]:
        """
        Get recorded anomaly events
        
        Args:
            service_name: Optional filter by service
            severity: Optional filter by severity
            hours: Time window in hours
            limit: Maximum number of events
            include_acknowledged: Include acknowledged events
            
        Returns:
            List of anomaly events
        """
        try:
            from models.jarvis_ai import AnomalyEvent
            
            with db_service.get_session() as session:
                query = session.query(AnomalyEvent)
                
                cutoff_time = datetime.utcnow() - timedelta(hours=hours)
                query = query.filter(AnomalyEvent.timestamp >= cutoff_time)
                
                if service_name:
                    query = query.filter(AnomalyEvent.service_name == service_name)
                
                if severity:
                    query = query.filter(AnomalyEvent.severity == severity)
                
                if not include_acknowledged:
                    query = query.filter(AnomalyEvent.is_acknowledged == False)
                
                events = query.order_by(AnomalyEvent.timestamp.desc()).limit(limit).all()
                
                return [event.to_dict() for event in events]
        except Exception as e:
            logger.error(f"Failed to get anomaly events: {e}")
            return []
    
    def acknowledge_anomaly(self, anomaly_id: int, acknowledged_by: str) -> bool:
        """
        Acknowledge an anomaly event
        
        Args:
            anomaly_id: ID of the anomaly event
            acknowledged_by: Username acknowledging the event
            
        Returns:
            True if successful
        """
        try:
            from models.jarvis_ai import AnomalyEvent
            
            with db_service.get_session() as session:
                event = session.query(AnomalyEvent).filter(
                    AnomalyEvent.id == anomaly_id
                ).first()
                
                if event:
                    event.is_acknowledged = True
                    event.acknowledged_by = acknowledged_by
                    event.acknowledged_at = datetime.utcnow()
                    return True
            
            return False
        except Exception as e:
            logger.error(f"Failed to acknowledge anomaly {anomaly_id}: {e}")
            return False
    
    def get_service_health_score(self, service_name: str) -> Dict:
        """
        Calculate an overall health score for a service
        
        Args:
            service_name: Name of the service
            
        Returns:
            Health score and breakdown
        """
        service_info = self.config.SERVICES.get(service_name)
        if not service_info:
            return {'success': False, 'error': f'Unknown service: {service_name}'}
        
        container_name = service_info.get('container')
        stats = service_ops.collect_container_stats(service_name, container_name)
        
        if not stats:
            return {
                'success': False,
                'error': 'Could not collect service stats',
                'health_score': 0
            }
        
        score = 100
        breakdown = []
        
        cpu = stats.get('cpu_percent', 0)
        if cpu > 90:
            score -= 30
            breakdown.append({'metric': 'cpu', 'impact': -30, 'reason': 'CPU usage critical (>90%)'})
        elif cpu > 70:
            score -= 15
            breakdown.append({'metric': 'cpu', 'impact': -15, 'reason': 'CPU usage high (>70%)'})
        
        memory_usage = stats.get('memory_usage', 0)
        memory_limit = stats.get('memory_limit', 1)
        memory_percent = (memory_usage / memory_limit * 100) if memory_limit > 0 else 0
        
        if memory_percent > 90:
            score -= 30
            breakdown.append({'metric': 'memory', 'impact': -30, 'reason': 'Memory usage critical (>90%)'})
        elif memory_percent > 70:
            score -= 15
            breakdown.append({'metric': 'memory', 'impact': -15, 'reason': 'Memory usage high (>70%)'})
        
        restart_count = stats.get('restart_count', 0)
        if restart_count > 5:
            score -= 25
            breakdown.append({'metric': 'restarts', 'impact': -25, 'reason': f'High restart count ({restart_count})'})
        elif restart_count > 2:
            score -= 10
            breakdown.append({'metric': 'restarts', 'impact': -10, 'reason': f'Elevated restarts ({restart_count})'})
        
        status = stats.get('status', 'unknown')
        health_status = stats.get('health_status', 'unknown')
        
        if status != 'running':
            score -= 50
            breakdown.append({'metric': 'status', 'impact': -50, 'reason': f'Container not running ({status})'})
        elif health_status == 'unhealthy':
            score -= 30
            breakdown.append({'metric': 'health', 'impact': -30, 'reason': 'Container health check failing'})
        
        score = max(0, min(100, score))
        
        if score >= 80:
            health_status = 'healthy'
        elif score >= 50:
            health_status = 'degraded'
        else:
            health_status = 'unhealthy'
        
        return {
            'success': True,
            'service_name': service_name,
            'health_score': score,
            'health_status': health_status,
            'breakdown': breakdown,
            'metrics': stats,
            'calculated_at': datetime.utcnow().isoformat()
        }
    
    def _record_anomaly_event(self, anomaly: Dict) -> Optional[int]:
        """Record an anomaly event to the database"""
        try:
            from models.jarvis_ai import AnomalyEvent
            
            with db_service.get_session() as session:
                event = AnomalyEvent(
                    service_name=anomaly['service_name'],
                    metric_name=anomaly['metric_name'],
                    value=anomaly['value'],
                    baseline_mean=anomaly.get('baseline_mean'),
                    baseline_std=anomaly.get('baseline_std'),
                    anomaly_score=anomaly['anomaly_score'],
                    direction=anomaly['direction'],
                    severity=anomaly['severity']
                )
                session.add(event)
                session.flush()
                return event.id
        except Exception as e:
            logger.error(f"Failed to record anomaly event: {e}")
            return None


anomaly_detector = AnomalyDetector()

__all__ = ['AnomalyDetector', 'anomaly_detector']
