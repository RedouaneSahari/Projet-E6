# InfluxDB setup

Measurement: `water_metrics`
Fields:
- temperature (float)
- ph (float)
- turbidity (float)
- water_level (float)
- humidity (float)

Example line protocol:
water_metrics temperature=24.6,ph=7.21,turbidity=13.8,water_level=78.2,humidity=52.1

Suggested bucket:
- name: aquaculture
- retention: 30d (adjustable)

Required env vars:
- INFLUX_URL
- INFLUX_TOKEN
- INFLUX_ORG
- INFLUX_BUCKET
