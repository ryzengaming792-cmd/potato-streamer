document.addEventListener('DOMContentLoaded', async () => {
    try {
        const videoElement = document.querySelector('.input_video');
        const canvasElement = document.querySelector('.output_canvas');
        const canvasCtx = canvasElement.getContext('2d');
        
        const connectBtn = document.getElementById('connectBtn');
        const toggleFilterBtn = document.getElementById('toggleFilterBtn');
        const switchOutfitBtn = document.getElementById('switchOutfitBtn');
        const switchBgBtn = document.getElementById('switchBgBtn');
        const statusText = document.getElementById('connectionStatus');
        
        // Calibration UI
        const alignBtn = document.getElementById('alignBtn');
        const calibrationControls = document.getElementById('calibrationControls');
        const closeCalibrationBtn = document.getElementById('closeCalibrationBtn');
        const sliderScaleX = document.getElementById('sliderScaleX');
        const sliderScaleY = document.getElementById('sliderScaleY');
        const sliderX = document.getElementById('sliderX');
        const sliderY = document.getElementById('sliderY');
        const sliderEyes = document.getElementById('sliderEyes');
        const sliderMouth = document.getElementById('sliderMouth');

        let isFilterOn = true;
        let currentFacingMode = 'user';
        let localStream = null;
        let peer = null;
        let currentCall = null;
        
        // Helper to dynamically remove white background using a Flood Fill algorithm
        function removeWhiteBg(imgUrl, callback) {
            const img = new Image();
            img.crossOrigin = "Anonymous";
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const data = imageData.data;
                const w = canvas.width;
                const h = canvas.height;
                
                // Keep track of visited pixels
                const visited = new Uint8Array(w * h);
                const queue = [];
                
                const getIndex = (x, y) => (y * w + x) * 4;
                const isWhite = (r, g, b) => r > 200 && g > 200 && b > 200;

                // Push initial border pixels
                for (let x = 0; x < w; x++) {
                    queue.push([x, 0], [x, h - 1]);
                }
                for (let y = 0; y < h; y++) {
                    queue.push([0, y], [w - 1, y]);
                }

                while (queue.length > 0) {
                    const [x, y] = queue.shift();
                    const i = y * w + x;
                    
                    if (x < 0 || x >= w || y < 0 || y >= h || visited[i]) continue;
                    visited[i] = 1;
                    
                    const idx = getIndex(x, y);
                    const r = data[idx];
                    const g = data[idx + 1];
                    const b = data[idx + 2];
                    const a = data[idx + 3];

                    if (a > 0 && isWhite(r, g, b)) {
                        data[idx + 3] = 0; // Make transparent
                        queue.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
                    }
                }
                
                ctx.putImageData(imageData, 0, 0);
                
                const processedImg = new Image();
                processedImg.onload = () => callback(processedImg);
                processedImg.src = canvas.toDataURL();
            };
            img.src = imgUrl;
        }

        const outfits = [
            { name: 'BASE', src: 'potato.png', sx: 1, sy: 1, ox: 0, oy: 0 },
            { name: 'BATMAN', src: 'batman.png', sx: 1, sy: 1, ox: 0, oy: 0 },
            { name: 'SPIDER', src: 'spiderman.png', sx: 1, sy: 1, ox: 0, oy: 0 },
            { name: 'POPEYE', src: 'popeye.png', sx: 1, sy: 1, ox: 0, oy: 0 },
            { name: 'T-REX', src: 'trex.png', sx: 1.1, sy: 1.1, ox: 0, oy: -0.05 }
        ];

        let currentOutfitIdx = 0;
        
        // Pre-process backgrounds to transparent
        outfits.forEach(o => {
            removeWhiteBg(o.src, (processedImg) => {
                o.img = processedImg;
            });
        });

        const backgrounds = [
            { name: 'NONE', color: '#000000' }, // Will act as Green Screen later based on implementation plan
            { name: 'GAMER', color: '#1a0b2e' },
            { name: 'NEON', color: '#00ffcc' },
            { name: 'HACKER', color: '#00ff00' }
        ];
        let currentBgIdx = 0;

        function onResults(results) {
            canvasCtx.save();
            // Clear canvas
            canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

            // Draw Background
            canvasCtx.fillStyle = backgrounds[currentBgIdx].color;
            canvasCtx.fillRect(0, 0, canvasElement.width, canvasElement.height);

            if (isFilterOn && results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
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
                const currentOutfit = outfits[currentOutfitIdx];
                const scaleX = currentOutfit.sx;
                const scaleY = currentOutfit.sy;
                
                const padX = (maxX - minX) * 0.4 * scaleX;
                const padY = (maxY - minY) * 0.4 * scaleY;
                
                const basePw = (maxX - minX + padX * 2) * w;
                const basePh = (maxY - minY + padY * 2) * h;
                
                const px = (minX - padX) * w + (currentOutfit.ox * basePw);
                const py = (minY - padY) * h + (currentOutfit.oy * basePh);
                const pw = basePw;
                const ph = basePh;

                // Calculate head rotation (tilt)
                let headAngle = 0;
                const leftEyeLm = landmarks[133];
                const rightEyeLm = landmarks[362];
                if (leftEyeLm && rightEyeLm) {
                    const dx = (rightEyeLm.x - leftEyeLm.x) * w;
                    const dy = (rightEyeLm.y - leftEyeLm.y) * h;
                    headAngle = Math.atan2(dy, dx);
                }

                canvasCtx.save();
                // Translate to center of potato, rotate, then translate back to draw everything tilted
                const centerX = px + pw / 2;
                const centerY = py + ph / 2;
                canvasCtx.translate(centerX, centerY);
                canvasCtx.rotate(headAngle);
                canvasCtx.translate(-centerX, -centerY);

                // Draw Potato Body
                const currentOutfitImg = currentOutfit.img;
                if(currentOutfitImg && currentOutfitImg.complete) {
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

                const eyesPad = parseFloat(sliderEyes.value);
                const mouthPad = parseFloat(sliderMouth.value);

                // Draw eyes and mouth with adjustable padding
                if(typeof FACEMESH_LEFT_EYE !== 'undefined') drawFeature(FACEMESH_LEFT_EYE, eyesPad, eyesPad);
                if(typeof FACEMESH_RIGHT_EYE !== 'undefined') drawFeature(FACEMESH_RIGHT_EYE, eyesPad, eyesPad);
                if(typeof FACEMESH_LIPS !== 'undefined') drawFeature(FACEMESH_LIPS, mouthPad, mouthPad + 0.05);

                canvasCtx.restore(); // Restore rotation
            } else if (!isFilterOn) {
                // If filter is OFF, just draw the raw camera feed to fill the canvas
                canvasCtx.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
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

        switchOutfitBtn.addEventListener('click', () => {
            currentOutfitIdx = (currentOutfitIdx + 1) % outfits.length;
            switchOutfitBtn.textContent = `OUTFIT: ${outfits[currentOutfitIdx].name}`;
            
            // Update sliders if calibration menu is open
            sliderScaleX.value = outfits[currentOutfitIdx].sx;
            sliderScaleY.value = outfits[currentOutfitIdx].sy;
            sliderX.value = outfits[currentOutfitIdx].ox;
            sliderY.value = outfits[currentOutfitIdx].oy;
        });

        switchBgBtn.addEventListener('click', () => {
            currentBgIdx = (currentBgIdx + 1) % backgrounds.length;
            switchBgBtn.textContent = `BG: ${backgrounds[currentBgIdx].name}`;
        });

        // --- Calibration Controls ---
        alignBtn.addEventListener('click', () => {
            calibrationControls.classList.remove('hidden');
            sliderScaleX.value = outfits[currentOutfitIdx].sx;
            sliderScaleY.value = outfits[currentOutfitIdx].sy;
            sliderX.value = outfits[currentOutfitIdx].ox;
            sliderY.value = outfits[currentOutfitIdx].oy;
        });
        
        closeCalibrationBtn.addEventListener('click', () => {
            calibrationControls.classList.add('hidden');
        });

        sliderScaleX.addEventListener('input', (e) => outfits[currentOutfitIdx].sx = parseFloat(e.target.value));
        sliderScaleY.addEventListener('input', (e) => outfits[currentOutfitIdx].sy = parseFloat(e.target.value));
        sliderX.addEventListener('input', (e) => outfits[currentOutfitIdx].ox = parseFloat(e.target.value));
        sliderY.addEventListener('input', (e) => outfits[currentOutfitIdx].oy = parseFloat(e.target.value));

        // --- PeerJS WebRTC ---
        connectBtn.addEventListener('click', () => {
            statusText.textContent = "CONNECTING TO LOBBY...";
            statusText.className = "status";
            
            // Get Stream ID from URL
            const urlParams = new URLSearchParams(window.location.search);
            const streamId = urlParams.get('id');

            if (!streamId) {
                statusText.textContent = "ERROR: NO STREAM ID IN URL";
                statusText.className = "status disconnected";
                return;
            }

            // Generate a random ID for the sender
            const senderId = `potato-${streamId}-sender-${Math.floor(Math.random() * 1000)}`;
            peer = new Peer(senderId);

            peer.on('open', (id) => {
                statusText.textContent = "CALLING OBS...";
                
                // Capture canvas at a slightly reduced framerate (24fps) to heavily optimize WebRTC bandwidth
                const stream = canvasElement.captureStream(24);
                
                const obsPeerId = `potato-${streamId}-obs`;
                currentCall = peer.call(obsPeerId, stream);
                
                // Wait for WebRTC to officially connect to OBS
                statusText.textContent = "CALLING OBS...";
                
                if (currentCall.peerConnection) {
                    currentCall.peerConnection.oniceconnectionstatechange = () => {
                        const state = currentCall.peerConnection.iceConnectionState;
                        if (state === 'connected' || state === 'completed') {
                            statusText.textContent = "CONNECTED TO OBS";
                            statusText.className = "status connected";
                            connectBtn.style.display = 'none';
                        } else if (state === 'disconnected' || state === 'failed') {
                            statusText.textContent = "CONNECTION ERROR (OBS NOT FOUND)";
                            statusText.className = "status disconnected";
                            connectBtn.style.display = 'inline-block';
                        }
                    };
                }

                // Optimize video track sender
                if (currentCall.peerConnection) {
                    const senders = currentCall.peerConnection.getSenders();
                    senders.forEach(sender => {
                        if (sender.track && sender.track.kind === 'video') {
                            const parameters = sender.getParameters();
                            if (!parameters.encodings) parameters.encodings = [{}];
                            parameters.encodings[0].maxBitrate = 1500000; // Cap at 1.5 Mbps to prevent local network lag spikes
                            sender.setParameters(parameters).catch(e => console.error("Could not set bandwidth:", e));
                        }
                    });
                }

                currentCall.on('error', (err) => {
                    console.error(err);
                    statusText.textContent = "CONNECTION ERROR";
                    statusText.className = "status disconnected";
                });
            });

            peer.on('error', (err) => {
                console.error(err);
                statusText.textContent = "CONNECTION ERROR";
                statusText.className = "status disconnected";
                peer = null;
            });
        });
    } catch (err) {
        document.getElementById('connectionStatus').textContent = "JS ERROR: " + err.message;
        document.getElementById('connectionStatus').style.color = "red";
    }
});
