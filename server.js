//pm2 start server.js
const net = require('net');
const crc = require('crc');
const mqtt = require('mqtt');
const fs = require('fs');
const cors = require('cors');
const express = require('express');
const bodyParser = require('body-parser');
const { spawn } = require('child_process');
const mysql = require('mysql2/promise');
const https = require('https');

const pool = mysql.createPool({
  host: 'localhost',
  user: 'server',
  password: 'XXXXXXXXXXXXXXXXXXXXXX',
  database: 'business_android',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

const mqttAndroidClientUsr = 'android_client';
const mqttAndroidClientPass = 'XXXXXXXXXXXXXXXXXXXXX';

const googleMapsKey = 'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';

const PORT = 3000;
const app = express();
const api_port = 1312; 

// Load SSL/TLS key and certificate
const options = {
    key: fs.readFileSync('/home/theodosiosk/certificates/key.pem'), // Path to your SSL/TLS private key
    cert: fs.readFileSync('/home/theodosiosk/certificates/cert.pem'), // Path to your SSL/TLS certificate
    passphrase: 'XXXXXXXXXXXX' // Passphrase for the private key
};

// Create HTTPS server instance
const httpsServer = https.createServer(options, app);

// Parse JSON bodies
app.use(express.json());

// Initialize latitude and longitude variables
let longitude = 0; // Initialize longitude variable
let latitude = 0; // Initialize latitude variable
let battery = 0;

const { exec } = require('child_process');

const brokerAddress = '10.0.0.5';
const username = 'server';
const password = 'XXXXXXXXXXXXXXXXXXXXXXXXXXXXX';

const tokenAPI = 'XXXXXXXXXXXXXXXXXXXXXXXXXXXXX';

// Define a middleware function to check if the request is coming from your app
function checkAppAuthorization(req, res, next) {
  const { headers } = req;
  
  // Check if the request contains a specific header or parameter that identifies your app
  if (headers['x-app-token'] === tokenAPI) {
    // Proceed to the next middleware or route handler
    next();
  } else {
    // If the request does not contain the correct token, return an unauthorized response
    res.status(401).json({ success: false, message: 'Unauthorized. Access denied.' });
  }
}


// Define an API endpoint
app.get('/api/device/:imei', checkAppAuthorization, async (req, res) => {
  const imei = req.params.imei;

  try {
    // Query the database using the pool
    const [rows] = await pool.query('SELECT timestamp, latitude, longitude, battery FROM gps_devices_top WHERE imei = ?', [imei]);

    if (rows.length > 0) {
      const { timestamp, latitude, longitude, battery } = rows[0];
      res.json({ success: true, data: { timestamp, latitude, longitude, battery } });
    } else {
      res.json({ success: false, message: 'Device not found or no data available.' });
    }
  } catch (error) {
    console.error('Error while querying the database:', error);
    res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});

app.get('/api/authenticate/:username/:password', checkAppAuthorization, async (req, res) => {
  const username = req.params.username;
  const password = req.params.password;

  try {
    // Query the database using the pool
    const [rows] = await pool.query('SELECT imei_no1, imei_no2 FROM gps_devices WHERE username = ? AND password = ?', [username, password]);

    if (rows.length > 0) {
      // Authentication successful
      res.json({ success: true, message: 'Authentication successful.', google_key: googleMapsKey, mqtt_username: mqttAndroidClientUsr, mqtt_password: mqttAndroidClientPass, imei_no1: rows[0].imei_no1, imei_no2: rows[0].imei_no2 });
    } else {
      // Authentication failed
      res.json({ success: false, message: 'Authentication failed. Invalid username or password.' });
    }
  } catch (error) {
    console.error('Error while querying the database:', error);
    res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});


// Publish messages
function publishMessage(deviceImei, dataType, value) {
  const topic = deviceImei + '/' + dataType;
  const mosquittoPub = spawn('mosquitto_pub', [
    '-h', brokerAddress,
    '-t', topic,
    '-u', username,
    '-P', password,
    '-m', value
  ]);
  mosquittoPub.stdout.on('data', (data) => {
    console.log(`stdout: ${data}`);
  });
  mosquittoPub.stderr.on('data', (data) => {
    console.error(`stderr: ${data}`);
  });
  mosquittoPub.on('close', (code) => {
    if (code === 0) {
      console.log(`Message published successfully to topic: ${topic}: ${value}`);
    } else {
      console.error(`Error: mosquitto_pub process exited with code ${code}`);
    }
  });
}



const server = net.createServer((socket) => {
    console.log('Device connected');

    let deviceImei = null;

    socket.on('data', (data) => {
        handleCodec8Data(data, socket); 
    });

    socket.on('error', (err) => {
        console.log('Device error:', err);
    });

    socket.on('close', () => {
        console.log('Device disconnected');
    });

    async function handleCodec8Data(data, socket) {
		if (!deviceImei) {
		 deviceImei = extractIMEI(data);
		 console.log('Device IMEI:', deviceImei);

		 const authorized = await authorizeDevice(deviceImei);
		 socket.write(Buffer.from(authorized ? [0x01] : [0x00])); 
		} else {
		 const authorized = await authorizeDevice(deviceImei);
		 if (!authorized) {
			console.log('Device not authorized:', deviceImei);
			return; 
		 }

		 console.log('Device authorized:', deviceImei);
		 const payload = extractPayload(data);
		 console.log('AVL Payload Data:', payload);

		 const timestamp = payload.timestamp;
		const longitude = payload.longitude;
		const latitude = payload.latitude;
		const battery = payload.battery;

		try {
            		const existingRecord = await getExistingRecord(deviceImei);
    			if (existingRecord) {
                	await deleteRecord(deviceImei);
            	}
            		await insertRecord(deviceImei, timestamp, latitude, longitude, battery);
        	} catch (error) {
            		console.error('Error handling payload data: ', error);
        	}
			
		 publishMessage(deviceImei, 'longitude', longitude);
		 publishMessage(deviceImei, 'latitude', latitude);
		 publishMessage(deviceImei, 'battery', battery);
		 publishMessage(deviceImei, 'timestamp', timestamp);

		 const numRecords = calculateNumRecords(payload);
		 const ackBuffer = Buffer.alloc(4);
		 ackBuffer.writeUInt32BE(numRecords, 0);
		 socket.write(ackBuffer);
		}
	}
	
	
	async function getExistingRecord(imei) {
        const [rows] = await pool.query('SELECT * FROM gps_devices_top WHERE imei = ?', [imei]);
        return rows[0];
    }
 
    async function deleteRecord(imei) {
        await pool.query('DELETE FROM gps_devices_top WHERE imei = ?', [imei]);
    }
 
    async function insertRecord(imei, timestamp, latitude, longitude, battery) {
        await pool.query(
            'INSERT INTO gps_devices_top (imei, timestamp, latitude, longitude, battery) VALUES (?, ?, ?, ?, ?)',
            [imei, timestamp, latitude, longitude, battery]
        );
    }
});

function extractIMEI(data) {
    const imeiLength = data.slice(0, 2).readUInt16BE(0);
    const imeiStartIndex = 2; 
    const imeiEndIndex = imeiStartIndex + imeiLength;
    return data.slice(imeiStartIndex, imeiEndIndex).toString();
}

function get24HourTimestamp() {
  const now = new Date();

  // Subtract two hours from the current time
  now.setHours(now.getHours() + 2);

  // Format the timestamp as before
  return now.toISOString().slice(0, 19).replace('T', ' '); 
}



function extractPayload(data) {
    // Convert the Buffer to a hex string for debugging/logging
    const hexData = data.toString('hex');
    console.log("Hex Payload", hexData);

    // Find the index of "71" in the hexData
    const indexOf71 = hexData.indexOf('71');

    // If "71" is found, extract the byte one position after it
    let batteryHex;
    if (indexOf71 !== -1 && indexOf71 + 2 < hexData.length) {
        batteryHex = hexData.slice(indexOf71 + 2, indexOf71 + 4); // Extract the byte one position after "71"
    } else {
        // Handle the case when "71" is not found or there's not enough data after it
        console.error('Battery information not found or incomplete data.');
        return null; // You may choose to handle this differently based on your use case
    }

    // Convert hexadecimal battery value to decimal
    const battery = parseInt(batteryHex, 16);

    // Extract longitude and latitude from the received packet
    const longitudeHex = hexData.slice(38, 46); // Extract bytes 20 to 23 (inclusive) as longitude
    const latitudeHex = hexData.slice(46, 54); // Extract bytes 24 to 27 (inclusive) as latitude

    // Convert hexadecimal longitude and latitude to decimal
    const longitude = parseInt(longitudeHex, 16) / 10000000; // Assuming longitude is in 1e-7 degrees
    const latitude = parseInt(latitudeHex, 16) / 10000000; // Assuming latitude is in 1e-7 degrees

    return {
        timestamp: get24HourTimestamp(),
        latitude: latitude,
        longitude: longitude,
        battery: battery
    };
}


async function authorizeDevice(imei) {
	try {
		const [rows] = await pool.query('SELECT * FROM gps_devices WHERE imei_no1 = ? OR imei_no2 = ?', [imei, imei]);
		return rows.length > 0;
	} catch (error) {
		console.error('Error while querying the database:', error);
		return false;
	}
}


function calculateNumRecords(payload) {
    // Implement logic to determine number of records in the payload
    return 1; // Example, assuming one record per packet
}

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

// Start HTTPS server
httpsServer.listen(api_port, () => {
    console.log(`HTTPS server listening on port ${api_port}`);
});
