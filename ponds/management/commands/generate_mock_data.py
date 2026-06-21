import random
import math
from datetime import datetime, timedelta
from django.core.management.base import BaseCommand
from django.utils import timezone
from ponds.models import Pond, Sensor, SensorReading, WaterWheel

class Command(BaseCommand):
    help = 'Generates mock fish ponds, sensors, and historical data readings'

    def handle(self, *args, **options):
        self.stdout.write("Clearing existing data...")
        SensorReading.objects.all().delete()
        Sensor.objects.all().delete()
        WaterWheel.objects.all().delete()
        Pond.objects.all().delete()

        # 1. Create Ponds
        ponds_data = [
            {"name": "Pond Alpha (Shrimp)", "location": "North Sector", "wheel": True},
            {"name": "Pond Beta (Tilapia)", "location": "South Sector", "wheel": False},
            {"name": "Pond Gamma (Milkfish)", "location": "East Sector", "wheel": False},
        ]
        
        ponds = []
        for pdata in ponds_data:
            pond = Pond.objects.create(
                name=pdata["name"],
                location=pdata["location"],
                water_wheel_status=pdata["wheel"],
                auto_aeration_enabled=True if "Alpha" in pdata["name"] else False,
                auto_aeration_threshold=4.5
            )
            ponds.append(pond)
            self.stdout.write(f"Created Pond: {pond.name}")
            
            # Create multiple water wheels for each pond
            w1_status = 'on' if pdata["wheel"] else 'off'
            w2_status = 'off'
            WaterWheel.objects.create(pond=pond, name="增氧水車 01", status=w1_status)
            WaterWheel.objects.create(pond=pond, name="增氧水車 02", status=w2_status)
            self.stdout.write(f"  -> Created 2 water wheels for {pond.name}")

        # 2. Create Sensors for each Pond
        sensor_types = [
            ('temperature', 'Temp Sensor'),
            ('ph', 'pH Sensor'),
            ('dissolved_oxygen', 'D.O. Sensor'),
            ('water_level', 'Water Level'),
        ]

        sensors = []
        for pond in ponds:
            for stype, sname_prefix in sensor_types:
                sensor = Sensor.objects.create(
                    pond=pond,
                    name=f"{pond.name[:6].upper()}-{stype[:4].upper()}",
                    sensor_type=stype,
                    status='active'
                )
                sensors.append(sensor)
                self.stdout.write(f"Created Sensor: {sensor.name} ({stype}) for {pond.name}")

        # 3. Generate 7 days of historical readings (every 2 hours)
        self.stdout.write("Generating 7 days of historical readings...")
        now = timezone.now()
        start_time = now - timedelta(days=7)
        
        readings_to_create = []
        
        # Simulating time progression
        current_time = start_time
        while current_time <= now:
            hour = current_time.hour
            
            for sensor in sensors:
                val = self.generate_reading_value(sensor.sensor_type, hour, sensor.pond.water_wheel_status)
                
                reading = SensorReading(
                    sensor=sensor,
                    value=val,
                    timestamp=current_time
                )
                readings_to_create.append(reading)
                
            current_time += timedelta(hours=2)

        SensorReading.objects.bulk_create(readings_to_create)
        self.stdout.write(self.style.SUCCESS(f"Successfully generated {len(readings_to_create)} sensor readings."))

    def generate_reading_value(self, sensor_type, hour, wheel_status):
        # Generates realistic values based on time of day (hour) and water wheel state
        if sensor_type == 'temperature':
            # Temperature peaks at 15:00 (3 PM), lowest at 5:00 AM
            # Base temp 24, amplitude 3
            base_temp = 24.5
            temp_variation = 3.0 * math.sin((hour - 9) * math.pi / 12)
            noise = random.uniform(-0.5, 0.5)
            return round(base_temp + temp_variation + noise, 2)
            
        elif sensor_type == 'ph':
            # pH peaks in afternoon due to photosynthesis (algae consume CO2)
            base_ph = 7.6
            ph_variation = 0.4 * math.sin((hour - 10) * math.pi / 12)
            noise = random.uniform(-0.1, 0.1)
            return round(base_ph + ph_variation + noise, 2)
            
        elif sensor_type == 'dissolved_oxygen':
            # Dissolved oxygen drops at night (no photosynthesis, high respiration)
            # and goes up when water wheel is active!
            base_do = 6.0 if wheel_status else 4.8
            # daily solar variation
            do_variation = 1.8 * math.sin((hour - 8) * math.pi / 12)
            # wheel adds 1.5 - 2.5 mg/L oxygen
            wheel_boost = 2.0 if wheel_status else 0.0
            noise = random.uniform(-0.3, 0.3)
            return max(0.5, round(base_do + do_variation + wheel_boost + noise, 2))
            
        elif sensor_type == 'water_level':
            # Water level slowly evaporates, with random rain/filling increases
            # Base level around 2.0 meters
            base_wl = 2.0
            # small daily cycle
            wl_variation = 0.05 * math.sin(hour * math.pi / 12)
            noise = random.uniform(-0.02, 0.02)
            return round(base_wl + wl_variation + noise, 2)
        
        return 0.0
