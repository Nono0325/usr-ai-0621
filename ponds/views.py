import json
from django.shortcuts import render
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.utils import timezone
from datetime import timedelta
import random
import math

from ponds.models import Pond, Sensor, SensorReading, WaterWheel
from ponds.assistant import ask_assistant

# --- Auto Aeration Control Logic ---
def check_auto_aeration(pond):
    """
    If auto-aeration is enabled:
    - Dissolved Oxygen < threshold => Turn ON all stopped wheels.
    - Dissolved Oxygen >= threshold + 1.5 => Turn OFF all running wheels.
    """
    if not pond.auto_aeration_enabled:
        return
        
    do_sensors = Sensor.objects.filter(pond=pond, sensor_type='dissolved_oxygen', status='active')
    if not do_sensors.exists():
        return
        
    latest_reading = SensorReading.objects.filter(sensor__in=do_sensors).order_by('-timestamp').first()
    if not latest_reading:
        return
        
    do_value = latest_reading.value
    threshold = pond.auto_aeration_threshold
    
    if do_value < threshold:
        # Turn ON wheels
        inactive_wheels = WaterWheel.objects.filter(pond=pond, status='off')
        if inactive_wheels.exists():
            inactive_wheels.update(status='on')
            pond.water_wheel_status = True
            pond.save()
    elif do_value >= (threshold + 1.5):
        # Turn OFF wheels
        active_wheels = WaterWheel.objects.filter(pond=pond, status='on')
        if active_wheels.exists():
            active_wheels.update(status='off')
            pond.water_wheel_status = False
            pond.save()

# --- IoT Real-time Telemetry Simulator Catch-up ---
def catch_up_sensor_readings():
    """
    When the dashboard is loaded, check if sensor readings are lagging.
    If they are, simulate periodic 2-minute updates up to the current time.
    This simulates an active IoT sensor stream.
    """
    now = timezone.now()
    last_reading = SensorReading.objects.order_by('-timestamp').first()
    if not last_reading:
        return
        
    time_diff = now - last_reading.timestamp
    # Generate mock readings in 2-minute intervals up to current time (max 100 intervals)
    step = timedelta(minutes=2)
    current_time = last_reading.timestamp + step
    
    if time_diff > timedelta(hours=3):
        # Limit simulation run if away for a long time
        current_time = now - timedelta(hours=3)
        
    sensors = Sensor.objects.filter(status='active')
    if not sensors.exists():
        return
        
    readings_to_create = []
    
    def generate_value(sensor_type, hour, wheel_status):
        if sensor_type == 'temperature':
            base_temp = 24.5
            temp_variation = 3.0 * math.sin((hour - 9) * math.pi / 12)
            noise = random.uniform(-0.5, 0.5)
            return round(base_temp + temp_variation + noise, 2)
        elif sensor_type == 'ph':
            base_ph = 7.6
            ph_variation = 0.4 * math.sin((hour - 10) * math.pi / 12)
            noise = random.uniform(-0.1, 0.1)
            return round(base_ph + ph_variation + noise, 2)
        elif sensor_type == 'dissolved_oxygen':
            base_do = 6.0 if wheel_status else 4.8
            do_variation = 1.8 * math.sin((hour - 8) * math.pi / 12)
            wheel_boost = 2.0 if wheel_status else 0.0
            noise = random.uniform(-0.3, 0.3)
            return max(0.5, round(base_do + do_variation + wheel_boost + noise, 2))
        elif sensor_type == 'water_level':
            base_wl = 2.0
            wl_variation = 0.05 * math.sin(hour * math.pi / 12)
            noise = random.uniform(-0.02, 0.02)
            return round(base_wl + wl_variation + noise, 2)
        return 0.0

    while current_time <= now:
        hour = current_time.hour
        for sensor in sensors:
            val = generate_value(sensor.sensor_type, hour, sensor.pond.water_wheel_status)
            readings_to_create.append(
                SensorReading(
                    sensor=sensor,
                    value=val,
                    timestamp=current_time
                )
            )
        current_time += step
        
    if readings_to_create:
        SensorReading.objects.bulk_create(readings_to_create)
        
    # Apply auto-aeration logic catch-up
    for pond in Pond.objects.all():
        check_auto_aeration(pond)

# --- Dashboard Home View ---
def dashboard_view(request):
    catch_up_sensor_readings()
    ponds = Pond.objects.all()
    
    # Pack initial telemetry for each pond
    ponds_data = []
    for pond in ponds:
        sensors = Sensor.objects.filter(pond=pond)
        sensor_list = []
        for s in sensors:
            latest = SensorReading.objects.filter(sensor=s).order_by('-timestamp').first()
            sensor_list.append({
                'id': s.id,
                'name': s.name,
                'type': s.sensor_type,
                'status': s.status,
                'latest_value': latest.value if latest else 'N/A',
                'unit': '°C' if s.sensor_type == 'temperature' else ('mg/L' if s.sensor_type == 'dissolved_oxygen' else ('m' if s.sensor_type == 'water_level' else ''))
            })
            
        wheels = WaterWheel.objects.filter(pond=pond)
        wheel_list = []
        for w in wheels:
            wheel_list.append({
                'id': w.id,
                'name': w.name,
                'status': w.status
            })
            
        ponds_data.append({
            'pond': pond,
            'sensors': sensor_list,
            'wheels': wheel_list
        })
        
    context = {
        'ponds_data': ponds_data,
        'ponds': ponds
    }
    return render(request, 'dashboard.html', context)

# --- Pond CRUD APIs ---
@csrf_exempt
def pond_list_api(request):
    if request.method == 'GET':
        ponds = Pond.objects.all()
        data = []
        for p in ponds:
            data.append({
                'id': p.id,
                'name': p.name,
                'location': p.location,
                'water_wheel_status': p.water_wheel_status,
                'auto_aeration_enabled': p.auto_aeration_enabled,
                'auto_aeration_threshold': p.auto_aeration_threshold
            })
        return JsonResponse({'status': 'success', 'ponds': data})
        
    elif request.method == 'POST':
        try:
            req_data = json.loads(request.body)
            name = req_data.get('name')
            location = req_data.get('location', '')
            if not name:
                return JsonResponse({'status': 'error', 'message': 'Pond name is required'}, status=400)
                
            pond = Pond.objects.create(name=name, location=location)
            
            # Setup default sensors
            sensor_types = [
                ('temperature', f"{pond.name[:6].upper()}-TEMP"),
                ('ph', f"{pond.name[:6].upper()}-PH"),
                ('dissolved_oxygen', f"{pond.name[:6].upper()}-DISS"),
                ('water_level', f"{pond.name[:6].upper()}-WATE"),
            ]
            for stype, sname in sensor_types:
                Sensor.objects.create(pond=pond, name=sname, sensor_type=stype, status='active')
                
            # Create a first reading so it is initialized
            now = timezone.now()
            for s in Sensor.objects.filter(pond=pond):
                val = 25.0 if s.sensor_type == 'temperature' else (7.5 if s.sensor_type == 'ph' else (6.0 if s.sensor_type == 'dissolved_oxygen' else 2.0))
                SensorReading.objects.create(sensor=s, value=val, timestamp=now)

            return JsonResponse({
                'status': 'success', 
                'message': 'Pond created successfully with 4 default active sensors.',
                'pond': {'id': pond.id, 'name': pond.name, 'location': pond.location, 'water_wheel_status': pond.water_wheel_status}
            })
        except Exception as e:
            return JsonResponse({'status': 'error', 'message': str(e)}, status=500)

@csrf_exempt
def pond_detail_api(request, pond_id):
    try:
        pond = Pond.objects.get(id=pond_id)
    except Pond.DoesNotExist:
        return JsonResponse({'status': 'error', 'message': 'Pond not found'}, status=404)

    if request.method == 'PUT':
        try:
            req_data = json.loads(request.body)
            pond.name = req_data.get('name', pond.name)
            pond.location = req_data.get('location', pond.location)
            pond.save()
            return JsonResponse({
                'status': 'success', 
                'message': 'Pond updated successfully',
                'pond': {'id': pond.id, 'name': pond.name, 'location': pond.location}
            })
        except Exception as e:
            return JsonResponse({'status': 'error', 'message': str(e)}, status=500)
            
    elif request.method == 'DELETE':
        pond_name = pond.name
        pond.delete()
        return JsonResponse({'status': 'success', 'message': f"Pond '{pond_name}' was successfully deleted."})

# --- Sensor CRUD APIs ---
@csrf_exempt
def sensor_list_api(request, pond_id):
    try:
        pond = Pond.objects.get(id=pond_id)
    except Pond.DoesNotExist:
        return JsonResponse({'status': 'error', 'message': 'Pond not found'}, status=404)
        
    if request.method == 'GET':
        sensors = Sensor.objects.filter(pond=pond)
        data = []
        for s in sensors:
            data.append({
                'id': s.id,
                'name': s.name,
                'sensor_type': s.sensor_type,
                'status': s.status
            })
        return JsonResponse({'status': 'success', 'sensors': data})
        
    elif request.method == 'POST':
        try:
            req_data = json.loads(request.body)
            name = req_data.get('name')
            sensor_type = req_data.get('sensor_type')
            if not name or not sensor_type:
                return JsonResponse({'status': 'error', 'message': 'Name and sensor_type are required'}, status=400)
                
            sensor = Sensor.objects.create(
                pond=pond,
                name=name,
                sensor_type=sensor_type,
                status='active'
            )
            # Create a first initial reading
            val = 25.0 if sensor.sensor_type == 'temperature' else (7.5 if sensor.sensor_type == 'ph' else (6.0 if sensor.sensor_type == 'dissolved_oxygen' else 2.0))
            SensorReading.objects.create(sensor=sensor, value=val)
            
            return JsonResponse({
                'status': 'success',
                'message': 'Sensor added successfully.',
                'sensor': {'id': sensor.id, 'name': sensor.name, 'sensor_type': sensor.sensor_type, 'status': sensor.status}
            })
        except Exception as e:
            return JsonResponse({'status': 'error', 'message': str(e)}, status=500)

@csrf_exempt
def sensor_detail_api(request, sensor_id):
    try:
        sensor = Sensor.objects.get(id=sensor_id)
    except Sensor.DoesNotExist:
        return JsonResponse({'status': 'error', 'message': 'Sensor not found'}, status=404)
        
    if request.method == 'PUT':
        try:
            req_data = json.loads(request.body)
            sensor.name = req_data.get('name', sensor.name)
            sensor.status = req_data.get('status', sensor.status)
            sensor.save()
            return JsonResponse({
                'status': 'success',
                'message': 'Sensor updated successfully.',
                'sensor': {'id': sensor.id, 'name': sensor.name, 'sensor_type': sensor.sensor_type, 'status': sensor.status}
            })
        except Exception as e:
            return JsonResponse({'status': 'error', 'message': str(e)}, status=500)
            
    elif request.method == 'DELETE':
        sensor_name = sensor.name
        sensor.delete()
        return JsonResponse({'status': 'success', 'message': f"Sensor '{sensor_name}' deleted."})

# --- Historical Telemetry Charts API ---
def historical_data_api(request):
    pond_id = request.GET.get('pond_id')
    sensor_type = request.GET.get('sensor_type')
    days_param = request.GET.get('days', '7')
    
    try:
        days = int(days_param)
    except ValueError:
        days = 7
        
    if not pond_id or not sensor_type:
        return JsonResponse({'status': 'error', 'message': 'pond_id and sensor_type are required query parameters'}, status=400)
        
    try:
        pond = Pond.objects.get(id=pond_id)
    except Pond.DoesNotExist:
        return JsonResponse({'status': 'error', 'message': 'Pond not found'}, status=404)
        
    # Get active sensors matching type
    sensors = Sensor.objects.filter(pond=pond, sensor_type=sensor_type)
    if not sensors.exists():
        return JsonResponse({'status': 'success', 'labels': [], 'data': [], 'message': 'No sensor of this type exists for this pond.'})
        
    now = timezone.now()
    start_date = now - timedelta(days=days)
    
    # Query all readings for these sensors within range
    readings = SensorReading.objects.filter(
        sensor__in=sensors,
        timestamp__gte=start_date
    ).order_by('timestamp')
    
    labels = []
    values = []
    
    for r in readings:
        # local-formatted label e.g., 'MM/DD HH:MM'
        labels.append(r.timestamp.strftime("%m/%d %H:%M"))
        values.append(r.value)
        
    # Calculate stats
    avg_val = round(sum(values) / len(values), 2) if values else 0.0
    max_val = max(values) if values else 0.0
    min_val = min(values) if values else 0.0
    
    # Simple rule-based AI assessment of the health of this reading type
    health_status = "正常 (Healthy)"
    health_advice = "水質數據符合養殖安全標準，請繼續保持。"
    
    if sensor_type == 'ph' and values:
        abnormal_low = sum(1 for v in values if v < 7.0)
        abnormal_high = sum(1 for v in values if v > 8.5)
        if abnormal_low > 0:
            health_status = "警告：酸性過高 (Acidic Warning)"
            health_advice = "部分時段 pH 值低於 7.0，可能引發魚隻黏液分泌過多，建議適度施放石灰或碳酸氫鈉調整。"
        elif abnormal_high > 0:
            health_status = "警告：鹼性過高 (Alkaline Warning)"
            health_advice = "pH 超過 8.5，可能加速氨氮毒性。請注意藻類過度繁殖，必要時注入新鮮水源進行換水。"
            
    elif sensor_type == 'temperature' and values:
        high_temp = sum(1 for v in values if v > 30.0)
        low_temp = sum(1 for v in values if v < 18.0)
        if high_temp > 0:
            health_status = "警告：水溫偏高 (High Temp)"
            health_advice = "夏季中午水溫超過 30°C，會加速溶氧消耗與氨氮毒性。建議啟用遮陽網並開足水車。"
        elif low_temp > 0:
            health_status = "警報：水溫偏低 (Low Temp)"
            health_advice = "水溫低於 18°C，魚隻食慾將顯著下降。請減少投餌量避免殘餌污染水質。"
            
    elif sensor_type == 'dissolved_oxygen' and values:
        low_do = sum(1 for v in values if v < 4.0)
        crit_do = sum(1 for v in values if v < 3.0)
        if crit_do > 0:
            health_status = "危險：極度缺氧 (Critical Anoxia)"
            health_advice = "溶氧量多次低於臨界點 3.0 mg/L！極易造成集體浮頭死亡。必須立刻將所有增氧水車開至最大！"
        elif low_do > 0:
            health_status = "警告：溶氧量偏低 (Low D.O.)"
            health_advice = "溶氧降至 4.0 mg/L 以下。建議在夜間與清晨加強增氧水車運作。"
            
    elif sensor_type == 'water_level' and values:
        low_wl = sum(1 for v in values if v < 1.6)
        if low_wl > 0:
            health_status = "警告：水位偏低 (Low Water)"
            health_advice = "水位低於安全底線 1.6m。請檢查是否存在滲漏，並適度補充乾淨水源。"

    return JsonResponse({
        'status': 'success',
        'labels': labels,
        'data': values,
        'stats': {
            'avg': avg_val,
            'max': max_val,
            'min': min_val,
            'health_status': health_status,
            'health_advice': health_advice
        }
    })

# --- Water Wheel Control API ---
@csrf_exempt
def control_water_wheel_api(request, pond_id):
    if request.method != 'POST':
        return JsonResponse({'status': 'error', 'message': 'Only POST method is allowed'}, status=405)
    try:
        pond = Pond.objects.get(id=pond_id)
        req_data = json.loads(request.body)
        status = req_data.get('status')
        if status is None:
            return JsonResponse({'status': 'error', 'message': 'status field (boolean) is required'}, status=400)
            
        pond.water_wheel_status = bool(status)
        pond.save()
        
        status_str = "ON" if pond.water_wheel_status else "OFF"
        return JsonResponse({
            'status': 'success', 
            'message': f"Water wheel for pond '{pond.name}' turned {status_str}.",
            'water_wheel_status': pond.water_wheel_status
        })
    except Pond.DoesNotExist:
        return JsonResponse({'status': 'error', 'message': 'Pond not found'}, status=404)
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=500)

# --- Chatbot API ---
@csrf_exempt
def chat_api(request):
    if request.method != 'POST':
        return JsonResponse({'status': 'error', 'message': 'Only POST method is allowed'}, status=405)
    try:
        # Check settings loaded key
        req_data = json.loads(request.body)
        message = req_data.get('message')
        history_raw = req_data.get('history', [])
        
        if not message:
            return JsonResponse({'status': 'error', 'message': 'Message is required'}, status=400)
            
        # Reformat client history structure to OpenAI chat format if necessary
        # History format: [{'role': 'user', 'content': 'text'}, {'role': 'assistant', 'content': 'text'}]
        history = []
        for msg in history_raw:
            history.append({
                'role': msg.get('role', 'user'),
                'content': msg.get('content', '')
            })
            
        # Run chat assistant (will run tool calls if OpenAI invokes them)
        chat_response = ask_assistant(message, history)
        
        return JsonResponse({
            'status': 'success',
            'response': chat_response.get('response', ''),
            'ui_actions': chat_response.get('ui_actions', [])
        })
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=500)

# --- Physical IoT Sensor Integration API ---
@csrf_exempt
def iot_report_api(request):
    """
    Endpoint for physical microcontrollers (e.g. ESP32, Arduino) to HTTP POST sensor data.
    Takes pond_id, sensor_type, and value in JSON payload.
    """
    if request.method != 'POST':
        return JsonResponse({'status': 'error', 'message': 'Only POST method is allowed'}, status=405)
    try:
        data = json.loads(request.body)
        pond_id = data.get('pond_id')
        sensor_type = data.get('sensor_type')  # e.g., 'temperature', 'ph', 'dissolved_oxygen', 'water_level'
        value = data.get('value')
        
        if not pond_id or not sensor_type or value is None:
            return JsonResponse({'status': 'error', 'message': 'pond_id, sensor_type, and value are required fields'}, status=400)
            
        pond = Pond.objects.get(id=pond_id)
        
        # Check if sensor of this type exists for this pond, otherwise create it
        sensor, created = Sensor.objects.get_or_create(
            pond=pond,
            sensor_type=sensor_type,
            defaults={
                'name': f"PHYS-{pond.name[:4].upper()}-{sensor_type[:4].upper()}",
                'status': 'active'
            }
        )
        
        # Record the telemetry reading
        reading = SensorReading.objects.create(
            sensor=sensor,
            value=float(value)
        )
        
        # Trigger auto-aeration check
        check_auto_aeration(pond)
        
        return JsonResponse({
            'status': 'success',
            'message': f"Recorded reading {value} successfully to sensor '{sensor.name}' on '{pond.name}'.",
            'reading': {
                'id': reading.id,
                'sensor_name': sensor.name,
                'value': reading.value,
                'timestamp': reading.timestamp.strftime("%Y-%m-%d %H:%M:%S")
            }
        })
    except Pond.DoesNotExist:
        return JsonResponse({'status': 'error', 'message': 'Pond not found'}, status=404)
    except ValueError:
        return JsonResponse({'status': 'error', 'message': 'value must be a valid float'}, status=400)
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=500)

# --- Multiple Water Wheels APIs ---
@csrf_exempt
def water_wheel_list_api(request, pond_id):
    try:
        pond = Pond.objects.get(id=pond_id)
    except Pond.DoesNotExist:
        return JsonResponse({'status': 'error', 'message': 'Pond not found'}, status=404)
        
    if request.method == 'GET':
        wheels = WaterWheel.objects.filter(pond=pond)
        data = [{'id': w.id, 'name': w.name, 'status': w.status} for w in wheels]
        return JsonResponse({'status': 'success', 'wheels': data})
        
    elif request.method == 'POST':
        try:
            req_data = json.loads(request.body)
            name = req_data.get('name')
            if not name:
                return JsonResponse({'status': 'error', 'message': 'Name is required'}, status=400)
                
            wheel = WaterWheel.objects.create(pond=pond, name=name, status='off')
            return JsonResponse({
                'status': 'success',
                'message': f"Water wheel '{wheel.name}' added successfully.",
                'wheel': {'id': wheel.id, 'name': wheel.name, 'status': wheel.status}
            })
        except Exception as e:
            return JsonResponse({'status': 'error', 'message': str(e)}, status=500)

@csrf_exempt
def water_wheel_detail_api(request, wheel_id):
    try:
        wheel = WaterWheel.objects.get(id=wheel_id)
    except WaterWheel.DoesNotExist:
        return JsonResponse({'status': 'error', 'message': 'Water wheel not found'}, status=404)
        
    if request.method == 'PUT':
        try:
            req_data = json.loads(request.body)
            wheel.name = req_data.get('name', wheel.name)
            wheel.status = req_data.get('status', wheel.status)
            wheel.save()
            
            # Sync legacy pond status
            pond = wheel.pond
            pond.water_wheel_status = pond.water_wheels.filter(status='on').exists()
            pond.save()
            
            return JsonResponse({
                'status': 'success',
                'message': 'Water wheel updated successfully.',
                'wheel': {'id': wheel.id, 'name': wheel.name, 'status': wheel.status, 'water_wheel_status': pond.water_wheel_status}
            })
        except Exception as e:
            return JsonResponse({'status': 'error', 'message': str(e)}, status=500)
            
    elif request.method == 'DELETE':
        name = wheel.name
        pond = wheel.pond
        wheel.delete()
        
        # Sync legacy
        pond.water_wheel_status = pond.water_wheels.filter(status='on').exists()
        pond.save()
        
        return JsonResponse({'status': 'success', 'message': f"Water wheel '{name}' deleted."})

# --- Auto Aeration Config API ---
@csrf_exempt
def auto_aeration_config_api(request, pond_id):
    if request.method != 'POST':
        return JsonResponse({'status': 'error', 'message': 'Only POST method is allowed'}, status=405)
    try:
        pond = Pond.objects.get(id=pond_id)
        req_data = json.loads(request.body)
        
        enabled = req_data.get('enabled')
        threshold = req_data.get('threshold')
        
        if enabled is not None:
            pond.auto_aeration_enabled = bool(enabled)
        if threshold is not None:
            pond.auto_aeration_threshold = float(threshold)
            
        pond.save()
        
        # Immediately check aeration state
        check_auto_aeration(pond)
        
        return JsonResponse({
            'status': 'success',
            'message': 'Auto aeration config updated successfully.',
            'auto_aeration_enabled': pond.auto_aeration_enabled,
            'auto_aeration_threshold': pond.auto_aeration_threshold,
            'water_wheel_status': pond.water_wheel_status
        })
    except Pond.DoesNotExist:
        return JsonResponse({'status': 'error', 'message': 'Pond not found'}, status=404)
    except ValueError:
        return JsonResponse({'status': 'error', 'message': 'threshold must be a valid float'}, status=400)
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=500)
