document.addEventListener('DOMContentLoaded', async () => {
    const videoElement = document.querySelector('.input_video');
    const canvasElement = document.querySelector('.output_canvas');
    const canvasCtx = canvasElement.getContext('2d');
    
    const connectBtn = document.getElementById('connectBtn');
    const toggleFilterBtn = document.getElementById('toggleFilterBtn');
    const switchCameraBtn = document.getElementById('switchCameraBtn');
    const statusText = document.getElementById('connectionStatus');

    let isFilterOn = true;
    let currentFacingMode = 'user';
    let localStream = null;
    let peer = null;
    let currentCall = null;
    
    // Load potato image
    const potatoImg = new Image();
    potatoImg.src = 'potato.png';

    // Get Stream ID from URL
    const urlParams = new URLSearchParams(window.location.search);
    const streamId = urlParams.get('id');

    if (!streamId) {
        statusText.textContent = "ERROR: NO STREAM ID";
        return;
    }

    const obsPeerId = `potato-${streamId}-obs`;

    // --- MediaPipe Setup ---
    function onResults(results) {
        canvasCtx.save();
        // Clear canvas (transparent background for OBS)
        canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

        // Fill background if filter is off
        if (!isFilterOn) {
            // Draw full video
            canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);
            canvasCtx.restore();
            return;
        }

        // Draw Filter
        if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
            const landmarks = results.multiFaceLandmarks[0];
            
            // Calculate face bounding box
            let minX = 1, minY = 1, maxX = 0, maxY = 0;
            for (const lm of landmarks) {
                if (lm.x < minX) minX = lm.x;
                if (lm.y < minY) minY = lm.y;
                if (lm.x > maxX) maxX = lm.x;
                if (lm.y > maxY) maxY = lm.y;
            }

            const w = canvasElement.width;
            const h = canvasElement.height;
            
            // Expand bounding box for the potato body
            const padX = (maxX - minX) * 0.4;
            const padY = (maxY - minY) * 0.4;
            
            const px = (minX - padX) * w;
            const py = (minY - padY) * h;
            const pw = (maxX - minX + padX * 2) * w;
            const ph = (maxY - minY + padY * 2) * h;

            // Draw Potato Body
            if(potatoImg.complete) {
                canvasCtx.drawImage(potatoImg, px, py, pw, ph);
            }

            // Function to draw a specific facial feature from video onto the potato
            const drawFeature = (indices) => {
                canvasCtx.save();
                canvasCtx.beginPath();
                for (let i = 0; i < indices.length; i++) {
                    const lm = landmarks[indices[i][0]];
                    const x = lm.x * w;
                    const y = lm.y * h;
                    if (i === 0) canvasCtx.moveTo(x, y);
                    else canvasCtx.lineTo(x, y);
                }
                canvasCtx.closePath();
                canvasCtx.clip();
                canvasCtx.drawImage(results.image, 0, 0, w, h);
                canvasCtx.restore();
            };

            // Using standard MediaPipe indices exported globally
            if(typeof FACEMESH_LEFT_EYE !== 'undefined') drawFeature(FACEMESH_LEFT_EYE);
            if(typeof FACEMESH_RIGHT_EYE !== 'undefined') drawFeature(FACEMESH_RIGHT_EYE);
            if(typeof FACEMESH_LIPS !== 'undefined') drawFeature(FACEMESH_LIPS);
        }
        
        canvasCtx.restore();
    }

    const faceMesh = new FaceMesh({locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
    }});
    
    faceMesh.setOptions({
        maxNumFaces: 1,
        refineLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
    });
    
    faceMesh.onResults(onResults);

    async function startCamera() {
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
        }
        
        const attachStream = async (stream) => {
            localStream = stream;
            videoElement.srcObject = localStream;
            await videoElement.play();
            processVideoFrame();
        };

        try {
            // Try ideal high-quality constraints first
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { 
                    facingMode: currentFacingMode,
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                },
                audio: false
            });
            await attachStream(stream);
        } catch (err) {
            console.warn("High-quality camera request failed, trying basic fallback...", err);
            try {
                // Fallback to absolute bare minimum constraints
                const fallbackStream = await navigator.mediaDevices.getUserMedia({
                    video: true,
                    audio: false
                });
                await attachStream(fallbackStream);
            } catch (fallbackErr) {
                console.error("Camera error:", fallbackErr);
                statusText.textContent = "CAMERA ERROR";
                statusText.className = "status disconnected";
                alert(`Camera Error: ${fallbackErr.name} - ${fallbackErr.message}\n\n1. Ensure another app isn't using the camera.\n2. Check Chrome's Site Settings to ensure camera isn't blocked for this site.`);
            }
        }
    }

    async function processVideoFrame() {
        if (!videoElement.paused && !videoElement.ended) {
            await faceMesh.send({image: videoElement});
        }
        requestAnimationFrame(processVideoFrame);
    }

    // Start camera immediately
    startCamera();

    // --- UI Controls ---
    toggleFilterBtn.addEventListener('click', () => {
        isFilterOn = !isFilterOn;
        toggleFilterBtn.textContent = isFilterOn ? "TOGGLE FILTER (ON)" : "TOGGLE FILTER (OFF)";
    });

    switchCameraBtn.addEventListener('click', () => {
        currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
        startCamera();
    });

    // --- PeerJS Setup ---
    connectBtn.addEventListener('click', () => {
        if (peer) return; // Already connecting

        statusText.textContent = "CONNECTING TO SERVER...";
        statusText.className = "status";

        peer = new Peer({ debug: 2 });

        peer.on('open', (id) => {
            statusText.textContent = "CALLING OBS...";
            
            // Capture stream from canvas at 30 FPS
            const canvasStream = canvasElement.captureStream(30);
            
            // Call the OBS receiver
            currentCall = peer.call(obsPeerId, canvasStream);
            
            currentCall.on('stream', () => {
                // Not expecting stream back, but means connection is good
            });

            // We consider it connected when we successfully initiate the call
            statusText.textContent = "CONNECTED TO OBS";
            statusText.className = "status connected";
            connectBtn.style.display = 'none';
        });

        peer.on('error', (err) => {
            console.error(err);
            statusText.textContent = "CONNECTION ERROR";
            statusText.className = "status disconnected";
            peer = null;
        });
    });
});
