from django.test import TestCase, Client
from django.urls import reverse
from ponds.models import Pond, Sensor, SensorReading
import json

class AquacultureTestCase(TestCase):
    def setUp(self):
        self.client = Client()
        # Create a pond manually
        self.pond = Pond.objects.create(name="Test Pond A", location="North Side", water_wheel_status=False)
        self.temp_sensor = Sensor.objects.create(pond=self.pond, name="TEST-TEMP", sensor_type="temperature", status="active")
        self.reading = SensorReading.objects.create(sensor=self.temp_sensor, value=25.5)

    def test_pond_creation_and_string_representation(self):
        self.assertEqual(str(self.pond), "Test Pond A (North Side)")
        self.assertEqual(self.pond.water_wheel_status, False)

    def test_sensor_creation_and_string_representation(self):
        self.assertEqual(str(self.temp_sensor), "TEST-TEMP - Temperature (°C) (Test Pond A)")
        self.assertEqual(self.temp_sensor.sensor_type, "temperature")

    def test_dashboard_view_status(self):
        response = self.client.get(reverse('dashboard'))
        self.assertEqual(response.status_code, 200)

    def test_pond_list_api(self):
        # Test GET
        response = self.client.get(reverse('pond_list_api'))
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.content)
        self.assertEqual(data['status'], 'success')
        self.assertTrue(len(data['ponds']) >= 1)

        # Test POST (creating new pond should auto create default sensors)
        post_response = self.client.post(
            reverse('pond_list_api'),
            data=json.dumps({'name': 'Test Pond B', 'location': 'South Side'}),
            content_type='application/json'
        )
        self.assertEqual(post_response.status_code, 200)
        post_data = json.loads(post_response.content)
        self.assertEqual(post_data['status'], 'success')
        
        # Verify default sensors were created
        new_pond_id = post_data['pond']['id']
        sensors_count = Sensor.objects.filter(pond_id=new_pond_id).count()
        self.assertEqual(sensors_count, 4)

    def test_historical_data_api(self):
        url = f"{reverse('historical_data_api')}?pond_id={self.pond.id}&sensor_type=temperature&days=7"
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.content)
        self.assertEqual(data['status'], 'success')
        self.assertEqual(len(data['data']), 1)
        self.assertEqual(data['data'][0], 25.5)
        self.assertEqual(data['stats']['avg'], 25.5)

    def test_iot_report_api(self):
        post_response = self.client.post(
            reverse('iot_report_api'),
            data=json.dumps({
                'pond_id': self.pond.id,
                'sensor_type': 'ph',
                'value': 7.82
            }),
            content_type='application/json'
        )
        self.assertEqual(post_response.status_code, 200)
        data = json.loads(post_response.content)
        self.assertEqual(data['status'], 'success')
        self.assertEqual(data['reading']['value'], 7.82)
        
        # Verify it was added to database
        self.assertEqual(SensorReading.objects.filter(sensor__sensor_type='ph').count(), 1)
