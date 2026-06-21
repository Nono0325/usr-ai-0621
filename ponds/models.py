from django.db import models
from django.utils import timezone

class Pond(models.Model):
    name = models.CharField(max_length=100)
    location = models.CharField(max_length=200, blank=True)
    water_wheel_status = models.BooleanField(default=False) # Legacy single status indicator
    auto_aeration_enabled = models.BooleanField(default=False)
    auto_aeration_threshold = models.FloatField(default=4.0) # DO threshold to turn wheels ON
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.name} ({self.location})"

class Sensor(models.Model):
    SENSOR_TYPES = [
        ('temperature', 'Temperature (°C)'),
        ('ph', 'pH Level'),
        ('dissolved_oxygen', 'Dissolved Oxygen (mg/L)'),
        ('water_level', 'Water Level (m)'),
    ]
    
    SENSOR_STATUS = [
        ('active', 'Active'),
        ('inactive', 'Inactive'),
        ('error', 'Error'),
    ]

    pond = models.ForeignKey(Pond, on_delete=models.CASCADE, related_name='sensors')
    name = models.CharField(max_length=100)
    sensor_type = models.CharField(max_length=20, choices=SENSOR_TYPES)
    status = models.CharField(max_length=20, choices=SENSOR_STATUS, default='active')
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} - {self.get_sensor_type_display()} ({self.pond.name})"

class SensorReading(models.Model):
    sensor = models.ForeignKey(Sensor, on_delete=models.CASCADE, related_name='readings')
    value = models.FloatField()
    timestamp = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ['-timestamp']

    def __str__(self):
        return f"{self.sensor.name}: {self.value} at {self.timestamp}"

class WaterWheel(models.Model):
    WHEEL_STATUS = [
        ('on', 'Running'),
        ('off', 'Stopped'),
        ('error', 'Error'),
    ]
    pond = models.ForeignKey(Pond, on_delete=models.CASCADE, related_name='water_wheels')
    name = models.CharField(max_length=100)
    status = models.CharField(max_length=20, choices=WHEEL_STATUS, default='off')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.name} ({self.pond.name}) - {self.get_status_display()}"
