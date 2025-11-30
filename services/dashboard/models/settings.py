"""
System Settings Model
Key-value store for system-wide configuration and setup wizard settings
"""
from sqlalchemy import Column, Integer, String, DateTime, Text, Boolean, Index
from datetime import datetime
from models import Base


class SystemSetting(Base):
    """System-wide configuration key-value pairs"""
    __tablename__ = 'system_settings'
    
    id = Column(Integer, primary_key=True)
    
    key = Column(String(200), nullable=False, unique=True, index=True)
    value = Column(Text, nullable=True)
    
    category = Column(String(50), nullable=True, index=True)
    description = Column(Text, nullable=True)
    
    is_secret = Column(Boolean, default=False)
    is_required = Column(Boolean, default=False)
    
    last_validated = Column(DateTime, nullable=True)
    validation_status = Column(String(20), nullable=True)
    validation_message = Column(Text, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    __table_args__ = (
        Index('ix_system_setting_category', 'category'),
        Index('ix_system_setting_key_category', 'key', 'category'),
    )
    
    def to_dict(self, include_value=True):
        result = {
            'id': self.id,
            'key': self.key,
            'category': self.category,
            'description': self.description,
            'is_secret': self.is_secret,
            'is_required': self.is_required,
            'validation': {
                'status': self.validation_status,
                'message': self.validation_message,
                'last_checked': self.last_validated.isoformat() if self.last_validated else None
            },
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }
        
        if include_value and not self.is_secret:
            result['value'] = self.value
        elif include_value and self.is_secret:
            result['value'] = '[CONFIGURED]' if self.value else None
        
        return result
    
    @classmethod
    def get_value(cls, session, key: str, default=None):
        """Get a setting value by key"""
        setting = session.query(cls).filter(cls.key == key).first()
        return setting.value if setting else default
    
    @classmethod
    def set_value(cls, session, key: str, value: str, category: str = None, 
                  is_secret: bool = False, description: str = None):
        """Set or update a setting value"""
        setting = session.query(cls).filter(cls.key == key).first()
        if setting:
            setting.value = value
            if category:
                setting.category = category
            setting.updated_at = datetime.utcnow()
        else:
            setting = cls(
                key=key,
                value=value,
                category=category,
                is_secret=is_secret,
                description=description
            )
            session.add(setting)
        return setting
    
    @classmethod
    def get_by_category(cls, session, category: str):
        """Get all settings in a category"""
        return session.query(cls).filter(cls.category == category).all()
    
    @classmethod
    def update_validation(cls, session, key: str, status: str, message: str = None):
        """Update validation status for a setting"""
        setting = session.query(cls).filter(cls.key == key).first()
        if setting:
            setting.validation_status = status
            setting.validation_message = message
            setting.last_validated = datetime.utcnow()
            return True
        return False


__all__ = ['SystemSetting']
