from django.urls import path
from . import views

urlpatterns = [
    path('', views.dashboard_view, name='dashboard'),
    path('api/ponds/', views.pond_list_api, name='pond_list_api'),
    path('api/ponds/<int:pond_id>/', views.pond_detail_api, name='pond_detail_api'),
    path('api/ponds/<int:pond_id>/sensors/', views.sensor_list_api, name='sensor_list_api'),
    path('api/sensors/<int:sensor_id>/', views.sensor_detail_api, name='sensor_detail_api'),
    path('api/ponds/<int:pond_id>/water-wheel/', views.control_water_wheel_api, name='control_water_wheel_api'),
    path('api/ponds/<int:pond_id>/water-wheels/', views.water_wheel_list_api, name='water_wheel_list_api'),
    path('api/water-wheels/<int:wheel_id>/', views.water_wheel_detail_api, name='water_wheel_detail_api'),
    path('api/ponds/<int:pond_id>/auto-aeration/', views.auto_aeration_config_api, name='auto_aeration_config_api'),
    path('api/historical/', views.historical_data_api, name='historical_data_api'),
    path('api/chat/', views.chat_api, name='chat_api'),
    path('api/iot/report/', views.iot_report_api, name='iot_report_api'),
]
