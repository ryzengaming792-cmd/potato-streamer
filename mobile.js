document.addEventListener('DOMContentLoaded', async () => {
    const videoElement = document.querySelector('.input_video');
    const canvasElement = document.querySelector('.output_canvas');
    const canvasCtx = canvasElement.getContext('2d');
    
    const connectBtn = document.getElementById('connectBtn');
    const toggleFilterBtn = document.getElementById('toggleFilterBtn');
    const switchCameraBtn = document.getElementById('switchCameraBtn');
    const switchOutfitBtn = document.getElementById('switchOutfitBtn');
    const switchBgBtn = document.getElementById('switchBgBtn');
    const statusText = document.getElementById('connectionStatus');

    let isFilterOn = true;
    let currentFacingMode = 'user';
    let localStream = null;
    let peer = null;
    let currentCall = null;
    
    // Load outfits
    const outfits = [
        { name: 'BASE', src: 'potato.png' },
        { name: 'BATMAN', src: 'batman.png' },
        { name: 'SPIDER', src: 'spiderman.png' },
        { name: 'POPEYE', src: 'popeye.png' }
    ];
    outfits.forEach(o => {
        const img = new Image();
        img.src = o.src;
        o.img = img;
    });
    let currentOutfitIdx = 0;

    // Load backgrounds
    const backgrounds = [
        { name: 'NONE', src: null },
        { name: 'GALAXY', src: 'bg_galaxy.png' },
        { name: 'SEA', src: 'bg_sea.png' },
        { name: 'MOUNTAIN', src: 'bg_mountains.png' },
        { name: 'ICE', src: 'bg_ice_mountains.png' }
    ];
    backgrounds.forEach(b => {
        if (b.src) {
            const img = new Image();
            img.src = b.src;
            b.img = img;
        }
    });
    let currentBgIdx = 0;

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

        const currentBg = backgrounds[currentBgIdx];
        if (currentBg.img && currentBg.img.complete) {
            canvasCtx.drawImage(currentBg.img, 0, 0, canvasElement.width, canvasElement.height);
        }

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
            const currentOutfitImg = outfits[currentOutfitIdx].img;
            if(currentOutfitImg.complete) {
                canvasCtx.drawImage(currentOutfitImg, px, py, pw, ph);
            }

            // Function to draw a specific facial feature from video onto the potato
            const drawFeature = (indices, padX, padY) => {
                let fMinX = 1, fMinY = 1, fMaxX = 0, fMaxY = 0;
                for (let i = 0; i < indices.length; i++) {
                    const lm = landmarks[indices[i][0]];
                    if (lm.x < fMinX) fMinX = lm.x;
                    if (lm.y < fMinY) fMinY = lm.y;
                    if (lm.x > fMaxX) fMaxX = lm.x;
                    if (lm.y > fMaxY) fMaxY = lm.y;
                }
                
                const centerX = ((fMinX + fMaxX) / 2) * w;
                const centerY = ((fMinY + fMaxY) / 2) * h;
                const radiusX = ((fMaxX - fMinX) / 2) * w * padX;
                const radiusY = ((fMaxY - fMinY) / 2) * h * padY;

                canvasCtx.save();
                canvasCtx.beginPath();
                canvasCtx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, 2 * Math.PI);
                canvasCtx.clip();
                
                // Draw the raw camera feed inside the ellipse
                canvasCtx.drawImage(results.image, 0, 0, w, h);
                
                // Add a subtle inner shadow/border to blend it smoothly into the potato skin
                canvasCtx.lineWidth = 15;
                canvasCtx.strokeStyle = 'rgba(0,0,0,0.15)';
                canvasCtx.stroke();
                
                canvasCtx.restore();
            };

            // Draw eyes and mouth with slightly reduced padding per user request
            if(typeof FACEMESH_LEFT_EYE !== 'undefined') drawFeature(FACEMESH_LEFT_EYE, 1.35, 1.35);
            if(typeof FACEMESH_RIGHT_EYE !== 'undefined') drawFeature(FACEMESH_RIGHT_EYE, 1.35, 1.35);
            if(typeof FACEMESH_LIPS !== 'undefined') drawFeature(FACEMESH_LIPS, 1.15, 1.2);
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
                    width: { ideal: 1080 },
                    height: { ideal: 1080 },
                    aspectRatio: { ideal: 1 }
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

    switchOutfitBtn.addEventListener('click', () => {
        currentOutfitIdx = (currentOutfitIdx + 1) % outfits.length;
        switchOutfitBtn.textContent = `OUTFIT: ${outfits[currentOutfitIdx].name}`;
    });

    switchBgBtn.addEventListener('click', () => {
        currentBgIdx = (currentBgIdx + 1) % backgrounds.length;
        switchBgBtn.textContent = `BG: ${backgrounds[currentBgIdx].name}`;
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
