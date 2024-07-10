**Description**

This Node.js server application is designed to handle GPS data from Teltonika GPS devices, authenticate devices based on IMEI, decode incoming data, save it to a MySQL database, and publish it to an MQTT broker. Additionally, it provides secure API endpoints for third-party applications to authenticate users and retrieve GPS data.

**Key Features:**

1. **GPS Data Handling**:

    • Device Authentication: The server authenticates Teltonika GPS devices based on their IMEI numbers.

    • Data Decoding: Incoming data from the devices is decoded to extract GPS coordinates (latitude, longitude), timestamp, and battery level.

    • Database Storage: The decoded data is saved into a MySQL database, ensuring the latest information is available.

2. **MQTT Integration**:

    • Data Publishing: The server publishes the processed GPS data (latitude, longitude, battery, and timestamp) to specific MQTT topics, enabling real-time data updates.

3. **Secure API Endpoints**:

    • SSL/TLS Encryption: The server utilizes SSL/TLS certificates to secure API communications.
   
    • User Authentication: Provides an API endpoint for authenticating users. Successful authentication returns Google Maps API keys and MQTT credentials.
   
    • Data Retrieval: Provides an API endpoint to retrieve the latest GPS data for a device based on its IMEI.

5. **Middleware**:

    • Authorization Middleware: Ensures that only requests containing a specific token can access the API endpoints, enhancing security.

**Summary**

The server efficiently manages GPS data from Teltonika devices, ensuring data integrity and real-time updates through database storage and MQTT publishing. Its secure API endpoints allow third-party applications to authenticate users and access necessary data securely. This setup is ideal for applications requiring precise and timely GPS tracking information, such as fleet management systems or personal tracking services.
